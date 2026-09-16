package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// AttendanceRepository is the persistence contract for participant attendance.
type AttendanceRepository interface {
	GetByParticipantSession(ctx context.Context, participantID, sessionID, tenantID string) (*entity.ParticipantAttendance, error)
	ListBySession(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantAttendance, error)
	Upsert(ctx context.Context, a *entity.ParticipantAttendance) error
	BulkUpsert(ctx context.Context, items []entity.ParticipantAttendance) error
}
