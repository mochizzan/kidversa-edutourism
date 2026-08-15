package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// PhotoRepository is the persistence contract for SmartPhoto records.
type PhotoRepository interface {
	// CreatePhoto persists a new SmartPhoto row.
	CreatePhoto(ctx context.Context, p *entity.SmartPhoto) error
	// GetPhotoByID returns the photo, scoped to tenantID (empty string = caller-supplied scope, e.g. media stream).
	GetPhotoByID(ctx context.Context, id, tenantID string) (*entity.SmartPhoto, error)
	// ListPhotos returns a paginated photo list narrowed by f.
	ListPhotos(ctx context.Context, f PhotoFilter, page, limit int) (*Paginated[entity.SmartPhoto], error)
	// UpdatePhoto replaces the photo row.
	UpdatePhoto(ctx context.Context, p *entity.SmartPhoto) error
	// UpdatePhotoFields applies a partial (map) update. Use this instead of
	// UpdatePhoto(struct) so zero/false values are persisted (GORM zero-value bug, C2).
	UpdatePhotoFields(ctx context.Context, id string, fields map[string]interface{}) error
	// SetReportPhoto marks photoID as the exclusive report photo for the given
	// participant+session, clearing is_report_photo on all others in that scope.
	SetReportPhoto(ctx context.Context, participantID, sessionID, photoID string) error
	// DeletePhoto removes the photo row.
	DeletePhoto(ctx context.Context, id string) error
}

// PhotoFilter narrows a photo list query.
type PhotoFilter struct {
	ParticipantID string
	SessionID     string
	FrameID       string
	IsReportPhoto *bool
}
