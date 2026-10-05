package assessment

import (
	"context"
	"errors"
	"fmt"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
)

// Usecase implements assessment business logic (upsert + list).
type Usecase struct {
	repo        repository.AssessmentRepository
	sessionRepo repository.SessionRepository
	badgeUC     BadgeEvaluator
}

// BadgeEvaluator is the minimal contract the assessment usecase needs to trigger
// badge recomputation after a scored upsert (kept narrow to avoid an import cycle).
// tenantID is the caller-resolved tenant (from Upsert) and scopes the badge
// evaluation's assessment queries.
type BadgeEvaluator interface {
	EvaluateAfterAssessment(ctx context.Context, participantID, sessionSubstageID, tenantID string) error
}

// NewUsecase builds the assessment usecase. badgeUC may be nil (badge
// recomputation is then skipped, preserving prior behavior).
func NewUsecase(repo repository.AssessmentRepository, sessionRepo repository.SessionRepository, badgeUC BadgeEvaluator) *Usecase {
	return &Usecase{repo: repo, sessionRepo: sessionRepo, badgeUC: badgeUC}
}

// isNotFound reports whether err is an app-level NotFound.
func isNotFound(err error) bool {
	if err == nil {
		return false
	}
	_, code, ok := apperrors.AsAppError(err)
	return ok && code == "not_found"
}

// Upsert creates or updates an assessment keyed on (participant_id, session_substage_id).
// starRating 0 is a valid "absent/not-yet-scored" marker (DB DEFAULT 1); the
// contract treats >=1 as scored.
//
// Scoring gate (every check runs BEFORE any write, existing precedence kept):
//  1. Membership — ALL roles: nobody may score a participant who is not
//     enrolled in the session being scored (403 participant_not_in_session).
//  2. Session-level facilitator gate — for a FASILITATOR: an ACTIVE session
//     where the actor owns no group means scoring is closed (403
//     not_group_owner, via FacilitatorOwnsAnyGroup).
//  3. Participant-group ownership (assertOwnership) — the finer-grained rule
//     that stays in place: a FASILITATOR must also own the participant's own
//     group (403 not_group_owner). ADMIN/KOORDINATOR/SUPER_ADMIN bypass the
//     two facilitator ownership checks, never the membership check.
//
// session_not_active / group_completed / substage_completed keep their
// existing positions and codes for every other path.
//
// Concurrency (audit #14): the session-status gate runs twice — the unlocked
// read above keeps the existing fast-fail precedence, then the write phase
// below re-reads the session under SELECT ... FOR UPDATE inside the same
// transaction as the writes, so a CancelSession landing in between is observed
// under the row lock and the score is rejected instead of stored silently.
func (u *Usecase) Upsert(ctx context.Context, req repository.AssessmentFilter, starRating int, comment, assessedBy, actorID, actorRole string, assessedAt time.Time, tenantID string) (*entity.Assessment, error) {
	if req.ParticipantID == "" || req.SessionSubstageID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	if assessedBy == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	if err := u.assertOwnership(ctx, req.ParticipantID, actorID, actorRole); err != nil {
		return nil, err
	}
	if req.SessionID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	sess, err := u.sessionRepo.GetSessionByID(ctx, req.SessionID, tenantID)
	if err != nil {
		return nil, err
	}
	if sess.Status != entity.SessionActive {
		return nil, apperrors.Forbidden("session_not_active", errors.New("assessment can only be submitted when session is active"))
	}
	// Strict session-ownership gate (rule 1 + 2 above, before any write).
	// Membership applies to every role; the session-level group-ownership rule
	// applies to FASILITATOR only and sits above the finer-grained
	// participant-group check (assertOwnership) run earlier.
	p, perr := u.sessionRepo.GetParticipantByID(ctx, req.ParticipantID, tenantID)
	if perr != nil {
		return nil, perr
	}
	if p == nil || p.SessionID == nil || *p.SessionID != req.SessionID {
		return nil, apperrors.Forbidden("participant_not_in_session",
			errors.New("participant is not enrolled in the session being scored"))
	}
	if entity.UserRole(actorRole) == entity.RoleFasilitator {
		ownsAny, oerr := u.sessionRepo.FacilitatorOwnsAnyGroup(ctx, req.SessionID, actorID)
		if oerr != nil {
			return nil, oerr
		}
		if !ownsAny {
			return nil, apperrors.Forbidden("not_group_owner",
				errors.New("facilitator owns no group in the scored session"))
		}
	}
	g, err := u.sessionRepo.GetSessionGroupByParticipant(ctx, req.ParticipantID)
	if err != nil {
		return nil, err
	}
	if g != nil && g.Status == entity.GroupCompleted {
		return nil, apperrors.Forbidden("group_completed", errors.New("assessment cannot be changed after the group is completed"))
	}
	// Per-Kegiatan lock (Perbaikan-2): a COMPLETED/SKIPPED progress row locks
	// the nilai for that Kegiatan only. Other Kegiatan rows of the same group
	// stay writable until they complete. Rejected explicitly (403
	// substage_completed) instead of silently overwriting the locked score.
	if g != nil {
		rows, perr := u.sessionRepo.ListGroupStageProgressByGroup(ctx, g.ID)
		if perr != nil {
			return nil, perr
		}
		for i := range rows {
			if rows[i].SessionSubstageID != req.SessionSubstageID {
				continue
			}
			if rows[i].Status == entity.ProgressCompleted || rows[i].Status == entity.ProgressSkipped {
				return nil, apperrors.Forbidden("substage_completed",
					fmt.Errorf("assessment locked: group %s substage %s already %s", g.ID, req.SessionSubstageID, rows[i].Status))
			}
			break
		}
	}
	if starRating < 0 {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	// starRating 0 is the explicit "absent" marker (Q5c=B): a child who did not
	// participate. It is persisted as 0 (the column allows 0; DEFAULT 1 only
	// applies when the field is omitted on INSERT). 0 must NOT be coerced to 1 —
	// that would wrongly mark an absent child as scored and risk awarding badges.

	// WRITE PHASE — TOCTOU guard (audit #14). The session status gate above is
	// an UNLOCKED read: a CancelSession could commit between it and the writes
	// below, leaving a score silently stored on a cancelled session. The writes
	// therefore run inside one session-repo transaction that RE-READS the
	// session under SELECT ... FOR UPDATE (GetSessionByIDForUpdate) — the same
	// row lock CancelSession takes — so cancel and score serialize: if the
	// cancel committed first, the locked re-read sees CANCELLED and the write
	// is rejected (session_not_active); if this transaction holds the lock
	// first, the cancel waits until it commits, linearizing the score BEFORE
	// the cancel. The lock is held until every write below has completed.
	var saved *entity.Assessment
	if err := u.sessionRepo.Transaction(ctx, func(tx repository.SessionRepository) error {
		locked, lerr := tx.GetSessionByIDForUpdate(ctx, req.SessionID, tenantID)
		if lerr != nil {
			return lerr
		}
		if locked.Status != entity.SessionActive {
			return apperrors.Forbidden("session_not_active",
				errors.New("session was cancelled between the status gate and the assessment write"))
		}
		var perr error
		saved, perr = u.persistUpsert(ctx, req, starRating, comment, assessedBy, assessedAt, tenantID)
		return perr
	}); err != nil {
		return nil, err
	}
	if saved == nil {
		// Defensive: a Transaction implementation that reports success without
		// running fn must not reach badge evaluation with a nil assessment.
		return nil, apperrors.Internal("internal_error",
			errors.New("assessment write transaction did not run"))
	}
	return u.afterUpsert(ctx, saved, tenantID)
}

// persistUpsert is the WRITE half of Upsert: read the existing
// (participant, session Kegiatan) row, then revive/update/create it. It runs
// inside Upsert's locked session transaction (audit #14), performs no session
// status checks itself, and returns the persisted row so the caller can run
// afterUpsert (badge evaluation) once the transaction has committed.
func (u *Usecase) persistUpsert(ctx context.Context, req repository.AssessmentFilter, starRating int, comment, assessedBy string, assessedAt time.Time, tenantID string) (*entity.Assessment, error) {
	existing, err := u.repo.GetByParticipantStage(ctx, req.ParticipantID, req.SessionSubstageID, tenantID)
	if err != nil {
		if !isNotFound(err) {
			return nil, err
		}
		// NotFound among active rows: a soft-deleted assessment may occupy this
		// unique slot (OQ3). Revive it instead of creating a colliding row.
		if soft, serr := u.repo.GetByParticipantStageIncludingDeleted(ctx, req.ParticipantID, req.SessionSubstageID, tenantID); serr == nil && soft != nil {
			soft.StarRating = starRating
			if comment != "" {
				soft.Comment = comment
			}
			soft.AssessedBy = assessedBy
			if !assessedAt.IsZero() {
				soft.AssessedAt = assessedAt
			}
			if err := u.repo.Revive(ctx, soft); err != nil {
				return nil, err
			}
			return soft, nil
		}
		// NotFound entirely -> fall through to Create (upsert semantics).
	}
	if existing != nil {
		existing.StarRating = starRating
		if comment != "" {
			existing.Comment = comment
		}
		if assessedBy != "" {
			existing.AssessedBy = assessedBy
		}
		if !assessedAt.IsZero() {
			existing.AssessedAt = assessedAt
		}
		if err := u.repo.Update(ctx, existing); err != nil {
			return nil, err
		}
		return existing, nil
	}
	a := &entity.Assessment{
		ParticipantID:     req.ParticipantID,
		SessionID:         req.SessionID,
		SessionSubstageID: req.SessionSubstageID,
		StarRating:        starRating,
		Comment:           comment,
		AssessedBy:        assessedBy,
		AssessedAt:        assessedAt,
	}
	if a.AssessedAt.IsZero() {
		a.AssessedAt = apputil.Now()
	}
	if err := u.repo.Create(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

// afterUpsert triggers badge recomputation when the upsert is a scored (star>=1)
// assessment and a badge evaluator is wired. tenantID (the caller-resolved
// tenant from Upsert) scopes the badge evaluation's assessment queries. A badge
// error is returned so the caller (handler) surfaces it as an explicit HTTP
// error; the assessment itself already persisted.
func (u *Usecase) afterUpsert(ctx context.Context, a *entity.Assessment, tenantID string) (*entity.Assessment, error) {
	if u.badgeUC == nil || a.StarRating < 1 {
		return a, nil
	}
	if err := u.badgeUC.EvaluateAfterAssessment(ctx, a.ParticipantID, a.SessionSubstageID, tenantID); err != nil {
		return a, err
	}
	return a, nil
}

// assertOwnership denies the write when the actor is a FASILITATOR who does not
// own the participant's group. Non-facilitator roles bypass.
func (u *Usecase) assertOwnership(ctx context.Context, participantID, actorID, actorRole string) error {
	if entity.UserRole(actorRole) != entity.RoleFasilitator {
		return nil
	}
	owner, err := u.repo.GetGroupFacilitatorIDByParticipant(ctx, participantID)
	if err != nil {
		return err
	}
	if owner == nil || *owner != actorID {
		return apperrors.Forbidden("not_group_owner", errors.New("facilitator does not own this participant's group"))
	}
	return nil
}

// List returns assessments matching the filter (paginated).
func (u *Usecase) List(ctx context.Context, f repository.AssessmentFilter, page, limit int) (*repository.Paginated[entity.Assessment], error) {
	return u.repo.List(ctx, f, page, limit)
}
