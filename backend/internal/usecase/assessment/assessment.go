package assessment

import (
	"context"
	"errors"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
)

// Usecase implements assessment business logic (upsert + list).
type Usecase struct {
	repo    repository.AssessmentRepository
	badgeUC BadgeEvaluator
}

// BadgeEvaluator is the minimal contract the assessment usecase needs to trigger
// badge recomputation after a scored upsert (kept narrow to avoid an import cycle).
type BadgeEvaluator interface {
	EvaluateAfterAssessment(ctx context.Context, participantID, sessionSubstageID string) error
}

// NewUsecase builds the assessment usecase. badgeUC may be nil (badge
// recomputation is then skipped, preserving prior behavior).
func NewUsecase(repo repository.AssessmentRepository, badgeUC BadgeEvaluator) *Usecase {
	return &Usecase{repo: repo, badgeUC: badgeUC}
}

// Upsert creates or updates an assessment keyed on (participant_id, session_substage_id).
// starRating 0 is a valid "absent/not-yet-scored" marker (DB DEFAULT 1); the
// contract treats >=1 as scored. actorRole gates the write to the participant's
// group owner when the actor is a FASILITATOR; ADMIN/KOORDINATOR/SUPER_ADMIN bypass.
func (u *Usecase) Upsert(ctx context.Context, req repository.AssessmentFilter, starRating int, comment, assessedBy, actorID, actorRole string, assessedAt time.Time, syncStatus string) (*entity.Assessment, error) {
	if req.ParticipantID == "" || req.SessionSubstageID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	if err := u.assertOwnership(ctx, req.ParticipantID, actorID, actorRole); err != nil {
		return nil, err
	}
	if starRating < 0 {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	// starRating 0 is the explicit "absent" marker (Q5c=B): a child who did not
	// participate. It is persisted as 0 (the column allows 0; DEFAULT 1 only
	// applies when the field is omitted on INSERT). 0 must NOT be coerced to 1 —
	// that would wrongly mark an absent child as scored and risk awarding badges.
	existing, err := u.repo.GetByParticipantStage(ctx, req.ParticipantID, req.SessionSubstageID)
	if err == nil && existing != nil {
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
		if syncStatus != "" {
			existing.SyncStatus = entity.SyncStatus(syncStatus)
		}
		if err := u.repo.Update(ctx, existing); err != nil {
			return nil, err
		}
		return u.afterUpsert(ctx, existing)
	}
	a := &entity.Assessment{
		ParticipantID:     req.ParticipantID,
		SessionID:         req.SessionID,
		SessionSubstageID: req.SessionSubstageID,
		StarRating:        starRating,
		Comment:           comment,
		AssessedBy:        assessedBy,
		AssessedAt:        assessedAt,
		SyncStatus:        entity.SyncStatus(syncStatus),
	}
	if a.AssessedAt.IsZero() {
		a.AssessedAt = apputil.Now()
	}
	if a.SyncStatus == "" {
		a.SyncStatus = entity.SyncLocal
	}
	if err := u.repo.Create(ctx, a); err != nil {
		return nil, err
	}
	return u.afterUpsert(ctx, a)
}

// afterUpsert triggers badge recomputation when the upsert is a scored (star>=1)
// assessment and a badge evaluator is wired. A badge error is returned so the
// caller (handler) can log it; the assessment itself already persisted.
func (u *Usecase) afterUpsert(ctx context.Context, a *entity.Assessment) (*entity.Assessment, error) {
	if u.badgeUC == nil || a.StarRating < 1 {
		return a, nil
	}
	if err := u.badgeUC.EvaluateAfterAssessment(ctx, a.ParticipantID, a.SessionSubstageID); err != nil {
		return a, err
	}
	return a, nil
}

// BulkUpsert upserts many assessments. actorID/actorRole are threaded per-item for
// the facilitator ownership gate (see Upsert).
func (u *Usecase) BulkUpsert(ctx context.Context, items []entity.Assessment, actorID, actorRole string) ([]entity.Assessment, error) {
	out := make([]entity.Assessment, 0, len(items))
	for i := range items {
		it := items[i]
		res, err := u.Upsert(ctx,
			repository.AssessmentFilter{ParticipantID: it.ParticipantID, SessionID: it.SessionID, SessionSubstageID: it.SessionSubstageID},
			it.StarRating, it.Comment, it.AssessedBy, actorID, actorRole, it.AssessedAt, string(it.SyncStatus))
		if err != nil {
			return nil, err
		}
		out = append(out, *res)
	}
	return out, nil
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

// Delete removes an assessment by id.
func (u *Usecase) Delete(ctx context.Context, id string) error {
	return u.repo.Delete(ctx, id)
}
