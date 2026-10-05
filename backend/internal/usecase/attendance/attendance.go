package attendance

import (
	"context"
	"errors"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// Usecase contains the business logic for participant attendance.
//
// Attendance is per-Topik: every write carries a session_stage_id (the
// session_stages row — see entity.ParticipantAttendance) and is keyed on
// (participant_id, session_id, session_stage_id), so marking Topik B never
// touches Topik A's row. Reads accept an optional Topik filter; empty keeps
// the session-wide compat behavior. The whole-group COMPLETED lock is
// retained (a COMPLETED group rejects every write); a completed Topik alone
// does NOT lock attendance — only nilai is per-Kegiatan locked (assessment
// usecase, substage_completed). Every rejection is an explicit apperrors
// code; nothing is swallowed.
type Usecase struct {
	repo        repository.AttendanceRepository
	sessionRepo repository.SessionRepository
}

// NewUsecase builds the attendance usecase.
func NewUsecase(repo repository.AttendanceRepository, sessionRepo repository.SessionRepository) *Usecase {
	return &Usecase{repo: repo, sessionRepo: sessionRepo}
}

// ListBySession returns all attendance records for a session across every
// Topik (session-wide compat path).
func (u *Usecase) ListBySession(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantAttendance, error) {
	if sessionID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	return u.repo.ListBySession(ctx, sessionID, tenantID)
}

// ListBySessionStage returns attendance records for a session, narrowed to
// one Topik when sessionStageID is set. An empty sessionStageID keeps the
// session-wide compat behavior (all Topics).
func (u *Usecase) ListBySessionStage(ctx context.Context, sessionID, sessionStageID, tenantID string) ([]entity.ParticipantAttendance, error) {
	if sessionID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	if sessionStageID == "" {
		return u.repo.ListBySession(ctx, sessionID, tenantID)
	}
	return u.repo.ListBySessionStage(ctx, sessionID, sessionStageID, tenantID)
}

// Upsert marks attendance for a single participant for one Topik of a session.
//
// sessionStageID is required (every write is per-Topik) and must belong to
// the session — a stage of another session is rejected with an explicit
// topic_not_in_session instead of writing a cross-session row. The owning
// session is read first: a CANCELLED session rejects the write with
// session_not_active (read paths stay untouched).
func (u *Usecase) Upsert(ctx context.Context, participantID, sessionID, sessionStageID string, isPresent bool, markedBy, tenantID string) (*entity.ParticipantAttendance, error) {
	if participantID == "" || sessionID == "" || sessionStageID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	// Session-status gate first (mirrors the assessment usecase, which reads the
	// session before any group/topic gate): a CANCELLED session rejects every
	// attendance write with session_not_active before anything else is checked.
	sess, err := u.sessionRepo.GetSessionByID(ctx, sessionID, tenantID)
	if err != nil {
		return nil, err
	}
	if sess != nil && sess.Status == entity.SessionCancelled {
		return nil, apperrors.Forbidden("session_not_active", errors.New("attendance cannot be changed after the session is cancelled"))
	}
	// Whole-group lock keeps precedence over topic validation (mirrors the
	// assessment usecase where group_completed precedes substage_completed): a
	// COMPLETED group rejects every write before any topic validation.
	g, err := u.sessionRepo.GetSessionGroupByParticipant(ctx, participantID)
	if err != nil {
		return nil, err
	}
	if g != nil && g.Status == entity.GroupCompleted {
		return nil, apperrors.Forbidden("group_completed", errors.New("attendance cannot be changed after the group is completed"))
	}
	stages, err := u.sessionRepo.ListSessionStages(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	owned := false
	for i := range stages {
		if stages[i].ID == sessionStageID {
			owned = true
			break
		}
	}
	if !owned {
		return nil, apperrors.BadRequest("topic_not_in_session", errors.New("attendance stage does not belong to the session"))
	}
	a := &entity.ParticipantAttendance{
		ParticipantID:  participantID,
		SessionID:      sessionID,
		SessionStageID: sessionStageID,
		IsPresent:      isPresent,
		MarkedAt:       time.Now(),
		MarkedBy:       &markedBy,
	}
	if err := u.repo.Upsert(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}
