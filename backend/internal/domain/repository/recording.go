package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// RecordingRepository is the persistence contract for Recording records.
type RecordingRepository interface {
	// CreateRecording persists a new Recording row.
	CreateRecording(ctx context.Context, r *entity.Recording) error
	// GetRecordingByID returns the recording, scoped to tenantID (empty string = caller-supplied scope).
	GetRecordingByID(ctx context.Context, id, tenantID string) (*entity.Recording, error)
	// ListRecordings returns a paginated recording list narrowed by f.
	ListRecordings(ctx context.Context, f RecordingFilter, page, limit int) (*Paginated[entity.Recording], error)
	// UpdateRecording replaces the recording row.
	UpdateRecording(ctx context.Context, r *entity.Recording) error
	// UpdateRecordingFields applies a partial (map) update. Use this instead of
	// UpdateRecording(struct) so zero/false values are persisted (GORM zero-value bug, C2).
	UpdateRecordingFields(ctx context.Context, id string, fields map[string]interface{}) error
	// DeleteRecording removes the recording row.
	DeleteRecording(ctx context.Context, id string) error
}

// RecordingFilter narrows a recording list query.
type RecordingFilter struct {
	ParticipantID  string
	SessionID      string
	SessionStageID string
	ReviewStatus   string
}
