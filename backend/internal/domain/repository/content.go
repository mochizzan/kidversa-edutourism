package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// PhotoRepository is the persistence contract for SmartPhoto records.
type PhotoRepository interface {
	Create(ctx context.Context, p *entity.SmartPhoto) error
	GetByID(ctx context.Context, id string) (*entity.SmartPhoto, error)
	List(ctx context.Context, f PhotoFilter, page, limit int) (*Paginated[entity.SmartPhoto], error)
	Update(ctx context.Context, p *entity.SmartPhoto) error
	// UpdateFields applies a partial (map) update to a photo. Use this instead of
	// Update(struct) so zero/false values are persisted (GORM zero-value bug, C2).
	UpdateFields(ctx context.Context, id string, fields map[string]interface{}) error
	// SetReportPhoto marks photoID as the exclusive report photo for the given
	// participant+session, clearing is_report_photo on all others in that scope.
	SetReportPhoto(ctx context.Context, participantID, sessionID, photoID string) error
	Delete(ctx context.Context, id string) error
}

// PhotoFilter narrows a photo list query.
type PhotoFilter struct {
	ParticipantID string
	SessionID     string
	FrameID       string
	IsReportPhoto *bool
}

// RecordingRepository is the persistence contract for Recording records.
type RecordingRepository interface {
	Create(ctx context.Context, r *entity.Recording) error
	GetByID(ctx context.Context, id string) (*entity.Recording, error)
	List(ctx context.Context, f RecordingFilter, page, limit int) (*Paginated[entity.Recording], error)
	Update(ctx context.Context, r *entity.Recording) error
	// UpdateFields applies a partial (map) update to a recording. Use this instead
	// of Update(struct) so zero/false values are persisted (GORM zero-value bug, C2).
	UpdateFields(ctx context.Context, id string, fields map[string]interface{}) error
	Delete(ctx context.Context, id string) error
}

// RecordingFilter narrows a recording list query.
type RecordingFilter struct {
	ParticipantID  string
	SessionID      string
	SessionStageID string
	ReviewStatus   string
}

// ConsentRepository manages consent decisions (read for media scoping, write for responses).
type ConsentRepository interface {
	// GetValue returns the current consent value (true=granted) for a participant in a
	// session for the given consent type. Returns false when no record exists.
	GetValue(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) (bool, error)
	// Create persists a new consent log row (initial send).
	Create(ctx context.Context, log *entity.ConsentLog) error
	// Respond records a parent's consent decision, upserting the latest value.
	Respond(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType, value bool, ip, ua string) error
	// ListByParticipant returns all consent rows for a participant.
	ListByParticipant(ctx context.Context, participantID string) ([]entity.ConsentLog, error)
}
