package badge

import (
	"context"
	"errors"
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
}

// NewUsecase builds the badge usecase.
func NewUsecase(
	substageRepo repository.SessionSubstageRepository,
	programSubstageRepo repository.ProgramSubstageRepository,
	programRepo repository.ProgramRepository,
	assessmentRepo repository.AssessmentRepository,
	sessionRepo repository.SessionRepository,
) *Usecase {
	return &Usecase{
		substageRepo:        substageRepo,
		programSubstageRepo: programSubstageRepo,
		programRepo:         programRepo,
		assessmentRepo:      assessmentRepo,
		sessionRepo:         sessionRepo,
	}
}

// AwardSubtopikBadge awards (idempotently) a Kegiatan badge for the participant
// on the given Topik, using the Topik's badge_name/badge_image_url. The
// unique index uq_participant_subtopik_badge makes re-awarding a no-op.
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
	b := &entity.ParticipantBadge{
		ParticipantID:  participantID,
		ProgramID:      prog.ProgramID,
		ProgramStageID: &programStageID,
		BadgeType:      entity.BadgeTypeSubtopik,
		BadgeName:      prog.BadgeName,
		BadgeImageURL:  prog.BadgeImageURL,
	}
	if err := u.substageRepo.CreateBadge(ctx, b); err != nil {
		if isBadgeConflict(err) {
			got, gerr := u.substageRepo.ListBadgesByParticipantStage(ctx, participantID, programStageID)
			if gerr == nil && len(got) > 0 {
				return &got[0], nil
			}
		}
		return nil, err
	}
	return b, nil
}

// RecomputeFinalBadge awards a FINAL badge for the participant on the program
// once every Kegiatan of the program has an awarded Kegiatan badge for the
// participant. Enforces exactly one FINAL per (participant, program). Returns
// the badge (existing or newly created). Returns (nil, nil) when not all
// Kegiatan are completed yet (not an error).
func (u *Usecase) RecomputeFinalBadge(ctx context.Context, participantID, programID string) (*entity.ParticipantBadge, error) {
	if participantID == "" || programID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	// Enforce exactly one FINAL per (participant, program).
	existing, eerr := u.substageRepo.ListFinalBadgesByParticipant(ctx, participantID, programID)
	if eerr == nil && len(existing) > 0 {
		return &existing[0], nil
	}
	stages, err := u.programRepo.ListStages(ctx, programID)
	if err != nil {
		return nil, err
	}
	if len(stages) == 0 {
		return nil, nil
	}
	for i := range stages {
		got, gerr := u.substageRepo.ListBadgesByParticipantStage(ctx, participantID, stages[i].ID)
		if gerr != nil || len(got) == 0 {
			// Not all Kegiatan completed yet.
			return nil, nil
		}
	}
	prog, perr := u.programRepo.GetProgramByID(ctx, programID)
	if perr != nil {
		return nil, perr
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
func (u *Usecase) EvaluateAfterAssessment(ctx context.Context, participantID, sessionSubstageID string) error {
	if participantID == "" || sessionSubstageID == "" {
		return nil
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
	allScored := true
	for i := range allSubs {
		if allSubs[i].SessionStageID != sub.SessionStageID {
			continue
		}
		scored, lerr := u.assessmentRepo.List(ctx, repository.AssessmentFilter{
			ParticipantID:     participantID,
			SessionSubstageID: allSubs[i].ID,
		}, 1, 10)
		if lerr != nil || len(scored.Items) == 0 {
			allScored = false
			break
		}
		scoredEnough := false
		for j := range scored.Items {
			if scored.Items[j].StarRating >= 1 {
				scoredEnough = true
				break
			}
		}
		if !scoredEnough {
			allScored = false
			break
		}
	}
	if !allScored {
		return nil
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
	for i := range participants {
		// Best-effort: a single participant error must not block the others.
		_ = u.EvaluateAfterAssessment(ctx, participants[i].ID, sessionSubstageID)
	}
	return nil
}

// CheckAndCompleteGroup validates that all group_stage_progress rows for the
// group are COMPLETED or SKIPPED, and if so updates session_groups.status to
// COMPLETED. Idempotent: already COMPLETED groups are no-ops. Returns nil when
// progress is incomplete (caller decides policy).
func (u *Usecase) CheckAndCompleteGroup(ctx context.Context, sessionID, groupID, tenantID string) error {
	if groupID == "" {
		return nil
	}
	group, err := u.sessionRepo.GetSessionGroupByID(ctx, groupID, tenantID)
	if err != nil {
		return err
	}
	// Already completed — idempotent no-op.
	if group.Status == entity.GroupCompleted {
		return nil
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
	return u.sessionRepo.UpdateSessionGroup(ctx, group)
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
