package badge

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// Usecase awards participant badges (per-Kegiatan + cross-session Final).
type Usecase struct {
	substageRepo        repository.SessionSubstageRepository
	programSubstageRepo repository.ProgramSubstageRepository
	programRepo         repository.ProgramRepository
	assessmentRepo      repository.AssessmentRepository
	sessionRepo         repository.SessionRepository
	attendanceRepo      repository.AttendanceRepository
}

// NewUsecase builds the badge usecase.
func NewUsecase(
	substageRepo repository.SessionSubstageRepository,
	programSubstageRepo repository.ProgramSubstageRepository,
	programRepo repository.ProgramRepository,
	assessmentRepo repository.AssessmentRepository,
	sessionRepo repository.SessionRepository,
	attendanceRepo repository.AttendanceRepository,
) *Usecase {
	return &Usecase{
		substageRepo:        substageRepo,
		programSubstageRepo: programSubstageRepo,
		programRepo:         programRepo,
		assessmentRepo:      assessmentRepo,
		sessionRepo:         sessionRepo,
		attendanceRepo:      attendanceRepo,
	}
}

// AwardSubtopikBadge awards (idempotently) a Kegiatan badge for the participant
// on the given Topik, using the Topik's badge_name/badge_image_url. The
// unique index uq_participant_subtopik_badge makes re-awarding a no-op.
// When the Topik's badge_name template is empty no row is created — the skip
// is logged at info level and (nil, nil) is returned so a blank badge never
// reaches the report.
func (u *Usecase) AwardSubtopikBadge(ctx context.Context, participantID, programStageID string) (*entity.ParticipantBadge, error) {
	if participantID == "" || programStageID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	prog, err := u.programRepo.GetStageByID(ctx, programStageID)
	if err != nil {
		return nil, err
	}
	// Idempotent: return the existing badge if one was already awarded.
	existing, eerr := u.substageRepo.ListBadgesByParticipantStage(ctx, participantID, programStageID)
	if eerr == nil && len(existing) > 0 {
		return &existing[0], nil
	}
	if eerr != nil {
		// A failed idempotency pre-check must not be ignored: continuing would
		// risk a duplicate award and hides a real repo failure.
		return nil, fmt.Errorf("badge: list TOPIK badges participant=%s stage=%s: %w", participantID, programStageID, eerr)
	}
	// Empty name template → no row (log, not an error): the award is simply
	// not configurable for this Topik yet.
	if prog.BadgeName == "" {
		log.Printf("badge: skip TOPIK award participant=%s stage=%s: program_stages.badge_name is empty", participantID, programStageID)
		return nil, nil
	}
	b := &entity.ParticipantBadge{
		ParticipantID:  participantID,
		ProgramID:      prog.ProgramID,
		ProgramStageID: &programStageID,
		BadgeType:      entity.BadgeTypeTopik,
		BadgeName:      prog.BadgeName,
		BadgeImageURL:  prog.BadgeImageURL,
	}
	if err := u.substageRepo.CreateBadge(ctx, b); err != nil {
		if isBadgeConflict(err) {
			got, gerr := u.substageRepo.ListBadgesByParticipantStage(ctx, participantID, programStageID)
			if gerr == nil && len(got) > 0 {
				return &got[0], nil
			}
			if gerr != nil {
				log.Printf("badge: duplicate-recovery list TOPIK badges participant=%s stage=%s failed: %v", participantID, programStageID, gerr)
			}
		}
		return nil, err
	}
	return b, nil
}

// RecomputeFinalBadge reconciles the participant's FINAL badge for the program
// against the CURRENT program content. Completion means: every Topik
// (program_stage) of the program has an awarded TOPIK badge for the
// participant.
//   - all Topik assessed → ensure exactly one FINAL row exists (idempotent
//     award; an existing row is returned unchanged — Enforces exactly one
//     FINAL per (participant, program)).
//   - NOT all Topik assessed (e.g. the program grew Topik after the badge was
//     earned, or the participant migrated onto the grown program) → revoke an
//     existing FINAL row (soft delete via RevokeFinalBadge); a no-op when
//     none exists.
//
// TOPIK rows are never touched here — they are program-scoped and always
// carry across migrations. Returns (nil, nil) when there is nothing to do.
// When the program's final_badge_name template is empty no row is created —
// the skip is logged at info level. Every lookup/revoke failure is returned;
// nothing is swallowed. Re-running on the same state is a no-op.
func (u *Usecase) RecomputeFinalBadge(ctx context.Context, participantID, programID string) (*entity.ParticipantBadge, error) {
	if participantID == "" || programID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	// Existing FINAL row(s) drive the reconcile: returned as-is when the
	// program is still complete, revoked when it is not. A failed lookup must
	// not be ignored: continuing could award a duplicate on a repo failure.
	existing, eerr := u.substageRepo.ListFinalBadgesByParticipant(ctx, participantID, programID)
	if eerr != nil {
		return nil, fmt.Errorf("badge: list FINAL badges participant=%s program=%s: %w", participantID, programID, eerr)
	}
	stages, err := u.programRepo.ListStages(ctx, programID)
	if err != nil {
		return nil, err
	}
	if len(stages) == 0 {
		// Degenerate program without Topik: completion is undefined — keep an
		// existing FINAL (nothing proves it stale) and never award one.
		if len(existing) > 0 {
			return &existing[0], nil
		}
		return nil, nil
	}
	for i := range stages {
		got, gerr := u.substageRepo.ListBadgesByParticipantStage(ctx, participantID, stages[i].ID)
		if gerr != nil {
			// A lookup failure must not be treated as "not awarded": that would
			// silently withhold (or wrongly revoke) the FINAL badge on a repo error.
			return nil, fmt.Errorf("badge: list TOPIK badge participant=%s stage=%s: %w", participantID, stages[i].ID, gerr)
		}
		if len(got) == 0 {
			// Not every Topik is assessed (yet): a stale FINAL must not survive
			// this state — revoke it (no-op when none exists).
			if len(existing) == 0 {
				return nil, nil
			}
			if rerr := u.substageRepo.RevokeFinalBadge(ctx, participantID, programID); rerr != nil {
				return nil, fmt.Errorf("badge: revoke FINAL badge participant=%s program=%s: %w", participantID, programID, rerr)
			}
			log.Printf("badge: revoked FINAL participant=%s program=%s: not all Topik assessed", participantID, programID)
			return nil, nil
		}
	}
	// Every Topik has its TOPIK badge: the FINAL must exist — but only the
	// completion check above may grant it (the pre-check alone must never
	// bypass a re-evaluation of grown program content).
	if len(existing) > 0 {
		return &existing[0], nil
	}
	prog, perr := u.programRepo.GetProgramByID(ctx, programID)
	if perr != nil {
		return nil, perr
	}
	// Empty name template → no row (log, not an error).
	if prog.FinalBadgeName == "" {
		log.Printf("badge: skip FINAL award participant=%s program=%s: programs.final_badge_name is empty", participantID, programID)
		return nil, nil
	}
	b := &entity.ParticipantBadge{
		ParticipantID:  participantID,
		ProgramID:      programID,
		ProgramStageID: nil,
		BadgeType:      entity.BadgeTypeFinal,
		BadgeName:      prog.FinalBadgeName,
		BadgeImageURL:  prog.FinalBadgeImageURL,
	}
	if err := u.substageRepo.CreateBadge(ctx, b); err != nil {
		if isBadgeConflict(err) {
			got, gerr := u.substageRepo.ListFinalBadgesByParticipant(ctx, participantID, programID)
			if gerr == nil && len(got) > 0 {
				return &got[0], nil
			}
			if gerr != nil {
				log.Printf("badge: duplicate-recovery list FINAL badges participant=%s program=%s failed: %v", participantID, programID, gerr)
			}
		}
		return nil, err
	}
	return b, nil
}

// EvaluateAfterAssessment is called by the assessment usecase after a successful
// upsert with star >= 1. It resolves the scored Kegiatan (session Kegiatan) to
// its Topik, checks whether ALL Kegiatan of that Topik (within the same
// session Topik) are now scored (star >= 1) for the participant, and if so
// awards the Kegiatan badge and recomputes the cross-session Final badge.
// Errors are returned so the caller may log; the assessment itself already saved.
// tenantID scopes the per-Topik assessment queries (assessmentRepo.List rejects
// an empty tenant). Unreachable empty-tenant in production (both trigger paths
// resolve a non-empty tenant), but kept as a defensive BadRequest.
func (u *Usecase) EvaluateAfterAssessment(ctx context.Context, participantID, sessionSubstageID, tenantID string) error {
	if participantID == "" || sessionSubstageID == "" {
		return apperrors.BadRequest("validation_error", nil)
	}
	if tenantID == "" {
		return apperrors.BadRequest("tenant_required", nil)
	}
	sub, err := u.substageRepo.GetSessionSubstage(ctx, sessionSubstageID)
	if err != nil {
		return err
	}
	progSub, err := u.programSubstageRepo.GetSubstageByID(ctx, sub.ProgramSubstageID)
	if err != nil {
		return err
	}
	programStageID := progSub.ProgramStageID

	// All Kegiatan (session Kegiatan) of this Topik in this session Topik.
	allSubs, err := u.substageRepo.ListSessionSubstages(ctx, sub.SessionID)
	if err != nil {
		return err
	}
	ids := make([]string, 0, len(allSubs))
	for i := range allSubs {
		if allSubs[i].SessionStageID == sub.SessionStageID {
			ids = append(ids, allSubs[i].ID)
		}
	}
	// ONE batched lookup for every Kegiatan of the Topic (replaces the former
	// one-GetByParticipantStage-per-Kegiatan N+1). Star 0 (or a missing row)
	// means "not scored": only rows with star >= 1 land in the map, and the
	// Topic is complete only when EVERY Kegiatan id is present.
	scored, lerr := u.assessmentRepo.List(ctx, repository.AssessmentFilter{
		ParticipantID:      participantID,
		SessionID:          sub.SessionID,
		SessionSubstageIDs: ids,
		TenantID:           tenantID,
	}, 1, 1000)
	if lerr != nil {
		// A lookup failure must not masquerade as "not scored": return an
		// explicit error so the badge gap is never silently swallowed.
		return fmt.Errorf("badge: list assessments failed for participant=%s session=%s substages=%v: %w", participantID, sub.SessionID, ids, lerr)
	}
	synced := make(map[string]bool, len(scored.Items))
	for i := range scored.Items {
		if scored.Items[i].StarRating >= 1 {
			synced[scored.Items[i].SessionSubstageID] = true
		}
	}
	// Reaching here means the single query above succeeded: an incomplete map
	// is the genuine "not all scored yet" policy outcome, not a swallowed
	// failure.
	for j := range ids {
		if !synced[ids[j]] {
			return nil
		}
	}

	if _, err := u.AwardSubtopikBadge(ctx, participantID, programStageID); err != nil {
		return err
	}
	prog, perr := u.programRepo.GetStageByID(ctx, programStageID)
	if perr != nil {
		return perr
	}
	_, err = u.RecomputeFinalBadge(ctx, participantID, prog.ProgramID)
	return err
}

// CompleteSessionSubstage is the Live Monitor "Selesaikan Kegiatan" override: it
// marks a Kegiatan leaf (session_substage) COMPLETED and re-runs per-child badge
// evaluation for every enrolled participant of the session. Completion is forced,
// but fairness is preserved — a child only receives the Kegiatan badge if ALL
// their Kegiatan are actually scored (star >= 1); an absent child (0) gets none.
// callerTenant enforces tenant isolation (a mismatch returns forbidden).
func (u *Usecase) CompleteSessionSubstage(ctx context.Context, sessionSubstageID, callerTenant string) error {
	if sessionSubstageID == "" {
		return apperrors.BadRequest("validation_error", nil)
	}
	sub, err := u.substageRepo.GetSessionSubstage(ctx, sessionSubstageID)
	if err != nil {
		return err
	}
	// Tenant isolation: the substage's owning session must belong to callerTenant.
	if _, err := u.sessionRepo.GetSessionByID(ctx, sub.SessionID, callerTenant); err != nil {
		return err
	}
	now := time.Now()
	sub.Status = entity.SessionSubstageCompleted
	sub.CompletedAt = &now
	if err := u.substageRepo.UpdateSessionSubstage(ctx, sub); err != nil {
		return err
	}
	participants, err := u.sessionRepo.ListParticipants(ctx, sub.SessionID, "", "")
	if err != nil {
		return err
	}
	var failures []error
	for i := range participants {
		// Best-effort per participant: a single failure must not block the
		// others — it is logged and the loop moves on — but every failure is
		// aggregated so the caller never sees a silent 204 on total failure.
		if err := u.EvaluateAfterAssessment(ctx, participants[i].ID, sessionSubstageID, callerTenant); err != nil {
			log.Printf("badge: evaluate after session-substage %s failed for participant %s: %v (continuing with remaining participants)", sessionSubstageID, participants[i].ID, err)
			failures = append(failures, fmt.Errorf("participant %s: %w", participants[i].ID, err))
		}
	}
	if len(failures) > 0 {
		return fmt.Errorf("badge: evaluation after session-substage %s failed for %d of %d participant(s): %w", sessionSubstageID, len(failures), len(participants), errors.Join(failures...))
	}
	return nil
}

// ValidateGroupCompletion enforces the attendance-aware grading gate for
// group completion: it returns an explicit present_participants_unassessed
// error while any participant marked PRESENT (attendance is_present=true) in
// the group's current scope has not scored (star_rating >= 1) every Kegiatan
// leaf in scope. Attendance is per-Topik: presence is read from the rows of
// the group's current session stage when it is set (a single true row in that
// Topik marks the participant present); when no current stage is set the gate
// falls back to any-Topik presence across the session. Participants with no
// attendance row (belum absen) and explicitly absent participants are exempt —
// they are not required to be graded and never block completion. Scope mirrors
// the fasilitator frontend gate: the leaves of the group's current session
// stage, falling back to every session Kegiatan when no current stage is set.
// An unwired attendance repo conservatively falls back to grading every
// participant (the pre-attendance rule), so the gate can never be silently
// waived. Every lookup failure other than "not found" (never graded) is
// returned wrapped.
func (u *Usecase) ValidateGroupCompletion(ctx context.Context, group *entity.SessionGroup, tenantID string) error {
	if group == nil {
		return apperrors.Internal("internal_error", fmt.Errorf("badge: ValidateGroupCompletion called with nil group"))
	}
	// Present set: participant IDs with an explicit attendance row in scope.
	// A nil map (repo unwired) means every participant must be graded.
	var present map[string]bool
	if u.attendanceRepo != nil {
		var rows []entity.ParticipantAttendance
		var err error
		if group.CurrentSessionStageID != nil && *group.CurrentSessionStageID != "" {
			rows, err = u.attendanceRepo.ListBySessionStage(ctx, group.SessionID, *group.CurrentSessionStageID, tenantID)
		} else {
			rows, err = u.attendanceRepo.ListBySession(ctx, group.SessionID, tenantID)
		}
		if err != nil {
			return fmt.Errorf("badge: list attendance session=%s group=%s: %w", group.SessionID, group.ID, err)
		}
		present = make(map[string]bool, len(rows))
		for i := range rows {
			if rows[i].IsPresent {
				present[rows[i].ParticipantID] = true
			} else if _, ok := present[rows[i].ParticipantID]; !ok {
				present[rows[i].ParticipantID] = false
			}
		}
		markedPresent := false
		for _, isPresent := range present {
			if isPresent {
				markedPresent = true
				break
			}
		}
		// Nobody marked present → nobody must be graded.
		if !markedPresent {
			return nil
		}
	}
	subs, err := u.substageRepo.ListSessionSubstages(ctx, group.SessionID)
	if err != nil {
		return fmt.Errorf("badge: list substages session=%s: %w", group.SessionID, err)
	}
	subIDs := make([]string, 0, len(subs))
	for i := range subs {
		if group.CurrentSessionStageID == nil || *group.CurrentSessionStageID == "" ||
			subs[i].SessionStageID == *group.CurrentSessionStageID {
			subIDs = append(subIDs, subs[i].ID)
		}
	}
	if len(subIDs) == 0 {
		// No Kegiatan in scope → nothing to grade.
		return nil
	}
	participants, err := u.sessionRepo.ListParticipants(ctx, group.SessionID, group.ID, tenantID)
	if err != nil {
		return fmt.Errorf("badge: list participants group=%s: %w", group.ID, err)
	}
	for i := range participants {
		id := participants[i].ID
		if present != nil && !present[id] {
			// Unmarked (belum absen) or explicitly absent → exempt from the gate.
			continue
		}
		for k := range subIDs {
			a, lerr := u.assessmentRepo.GetByParticipantStage(ctx, id, subIDs[k], tenantID)
			if lerr != nil {
				if _, code, ok := apperrors.AsAppError(lerr); ok && code == "not_found" {
					return apperrors.BadRequest("present_participants_unassessed",
						fmt.Errorf("participant %s has not been scored on Kegiatan %s", id, subIDs[k]))
				}
				return fmt.Errorf("badge: get assessment participant=%s substage=%s: %w", id, subIDs[k], lerr)
			}
			if a.StarRating < 1 {
				return apperrors.BadRequest("present_participants_unassessed",
					fmt.Errorf("participant %s has no score (star_rating < 1) on Kegiatan %s", id, subIDs[k]))
			}
		}
	}
	return nil
}

// CheckAndCompleteGroup validates that all group_stage_progress rows for the
// group are COMPLETED or SKIPPED, and if so updates session_groups.status to
// COMPLETED. Idempotent: already COMPLETED groups only re-run the badge
// backfill (heal-on-re-PUT). Returns nil when progress is incomplete (caller
// decides policy). Every explicit completion attempt first runs the
// attendance-aware grading gate (ValidateGroupCompletion): a present but
// ungraded participant rejects the completion with an explicit error.
func (u *Usecase) CheckAndCompleteGroup(ctx context.Context, sessionID, groupID, tenantID string) error {
	if groupID == "" {
		return nil
	}
	group, err := u.sessionRepo.GetSessionGroupByID(ctx, groupID, tenantID)
	if err != nil {
		return err
	}
	// Already completed — heal any missing badges from existing scores, then
	// treat the completion itself as a no-op.
	if group.Status == entity.GroupCompleted {
		return u.backfillGroupBadges(ctx, group, tenantID)
	}
	// Attendance-aware grading gate: runs before the progress checks so the
	// PUT /groups/:groupId status=COMPLETED path can never complete a group
	// while a participant marked present is still ungraded.
	if err := u.ValidateGroupCompletion(ctx, group, tenantID); err != nil {
		return err
	}
	progress, err := u.sessionRepo.ListGroupStageProgressByGroup(ctx, groupID)
	if err != nil {
		return err
	}
	// No progress rows yet — nothing to complete.
	if len(progress) == 0 {
		return nil
	}
	// Check every row is COMPLETED or SKIPPED.
	for _, p := range progress {
		if p.Status != entity.ProgressCompleted && p.Status != entity.ProgressSkipped {
			return nil // not all done — no-op
		}
	}
	// All done — update group status.
	group.Status = entity.GroupCompleted
	if err := u.sessionRepo.UpdateSessionGroup(ctx, group); err != nil {
		return err
	}
	return u.backfillGroupBadges(ctx, group, tenantID)
}

// backfillGroupBadges creates any missing TOPIK/FINAL badges from scores
// that already exist — no new scoring event is required. For every participant
// of the group it re-runs badge evaluation once per session Topik (the first
// session Kegiatan of each session stage is enough: evaluation checks all
// Kegiatan of that Topik anyway). Idempotent: the award pre-checks make
// re-running a no-op when the rows already exist. Failures are logged with
// context and aggregated into one returned error.
func (u *Usecase) backfillGroupBadges(ctx context.Context, group *entity.SessionGroup, tenantID string) error {
	participants, err := u.sessionRepo.ListParticipants(ctx, group.SessionID, group.ID, tenantID)
	if err != nil {
		log.Printf("badge: backfill list participants group=%s failed: %v", group.ID, err)
		return fmt.Errorf("badge: backfill list participants group=%s: %w", group.ID, err)
	}
	if len(participants) == 0 {
		return nil
	}
	subs, err := u.substageRepo.ListSessionSubstages(ctx, group.SessionID)
	if err != nil {
		log.Printf("badge: backfill list substages session=%s failed: %v", group.SessionID, err)
		return fmt.Errorf("badge: backfill list substages session=%s: %w", group.SessionID, err)
	}
	// One sample Kegiatan per session Topik (first per session stage).
	sampleByStage := make(map[string]string, len(subs))
	stageOrder := make([]string, 0, len(subs))
	for i := range subs {
		stage := subs[i].SessionStageID
		if _, seen := sampleByStage[stage]; !seen {
			sampleByStage[stage] = subs[i].ID
			stageOrder = append(stageOrder, stage)
		}
	}
	var failures []error
	for i := range participants {
		for _, stage := range stageOrder {
			if err := u.EvaluateAfterAssessment(ctx, participants[i].ID, sampleByStage[stage], tenantID); err != nil {
				log.Printf("badge: backfill evaluate participant=%s substage=%s group=%s failed: %v", participants[i].ID, sampleByStage[stage], group.ID, err)
				failures = append(failures, fmt.Errorf("participant %s stage %s: %w", participants[i].ID, stage, err))
			}
		}
	}
	if len(failures) > 0 {
		return fmt.Errorf("badge: backfill failed for group=%s: %w", group.ID, errors.Join(failures...))
	}
	return nil
}

// isBadgeConflict reports whether err is an app conflict (duplicate-key) error.
func isBadgeConflict(err error) bool {
	if err == nil {
		return false
	}
	var ae *apperrors.AppError
	if errors.As(err, &ae) {
		return ae.CodeName() == "conflict"
	}
	return false
}
