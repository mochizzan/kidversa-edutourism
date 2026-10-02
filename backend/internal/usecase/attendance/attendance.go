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
