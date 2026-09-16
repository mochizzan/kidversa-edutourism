package attendance

import (
	"context"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// Usecase contains the business logic for participant attendance.
type Usecase struct {
	repo repository.AttendanceRepository
}

// NewUsecase builds the attendance usecase.
func NewUsecase(repo repository.AttendanceRepository) *Usecase {
	return &Usecase{repo: repo}
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

// BulkUpsert marks attendance for multiple participants.
func (u *Usecase) BulkUpsert(ctx context.Context, items []entity.ParticipantAttendance, markedBy, tenantID string) error {
	if len(items) == 0 {
		return apperrors.BadRequest("validation_error", nil)
	}
	for i := range items {
		items[i].MarkedAt = time.Now()
		items[i].MarkedBy = &markedBy
	}
	return u.repo.BulkUpsert(ctx, items)
}
