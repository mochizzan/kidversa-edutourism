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
type Usecase struct {
	repo        repository.AttendanceRepository
	sessionRepo repository.SessionRepository
}

// NewUsecase builds the attendance usecase.
func NewUsecase(repo repository.AttendanceRepository, sessionRepo repository.SessionRepository) *Usecase {
	return &Usecase{repo: repo, sessionRepo: sessionRepo}
}

// ListBySession returns all attendance records for a session.
func (u *Usecase) ListBySession(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantAttendance, error) {
	if sessionID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	return u.repo.ListBySession(ctx, sessionID, tenantID)
}

// Upsert marks attendance for a single participant in a session.
//
// Perbaikan-2, explicit choice (A): whole-group lock only. ParticipantAttendance
// is session-scoped WITHOUT a substage/stage column (entity/attendance.go), so a
// per-topik attendance lock is impossible without a schema migration — and the
// schema/repo/DTO/migration surface belongs to Perbaikan-1 (DO NOT touch here).
// Consequence, documented: after one Kegiatan (topik) completes, attendance rows
// for the session stay writable until the whole group reaches COMPLETED, while
// nilai for the completed Kegiatan is already locked per-substage in the
// assessment usecase. No fake per-topic rejection is issued here: rejecting
// without a backing column would be a false lock. If Perbaikan-1 lands a stage
// column, add the per-topic guard here (option B).
func (u *Usecase) Upsert(ctx context.Context, participantID, sessionID string, isPresent bool, markedBy, tenantID string) (*entity.ParticipantAttendance, error) {
	if participantID == "" || sessionID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	g, err := u.sessionRepo.GetSessionGroupByParticipant(ctx, participantID)
	if err != nil {
		return nil, err
	}
	if g != nil && g.Status == entity.GroupCompleted {
		return nil, apperrors.Forbidden("group_completed", errors.New("attendance cannot be changed after the group is completed"))
	}
	a := &entity.ParticipantAttendance{
		ParticipantID: participantID,
		SessionID:     sessionID,
		IsPresent:     isPresent,
		MarkedAt:      time.Now(),
		MarkedBy:      &markedBy,
	}
	if err := u.repo.Upsert(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}
