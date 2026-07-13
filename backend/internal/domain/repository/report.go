package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ReportFilter narrows a report list query.
type ReportFilter struct {
	ParticipantID string
	SessionID     string
	Status        string
	TenantID      string
}

// ReportRepository is the persistence contract for reports + parent access tokens.
type ReportRepository interface {
	Create(ctx context.Context, r *entity.Report) error
	GetByID(ctx context.Context, id, tenantID string) (*entity.Report, error)
	// GetByToken resolves a report by a valid, unrevoked, unexpired parent token.
	GetByToken(ctx context.Context, token string) (*entity.Report, error)
	List(ctx context.Context, f ReportFilter, page, limit int) (*Paginated[entity.Report], error)
	Update(ctx context.Context, r *entity.Report) error
	Delete(ctx context.Context, id string) error
}

// ParticipantMissionRepository links reports to completed missions.
type ParticipantMissionRepository interface {
	Create(ctx context.Context, m *entity.ParticipantMission) error
	GetByID(ctx context.Context, id string) (*entity.ParticipantMission, error)
	GetByReport(ctx context.Context, reportID string) ([]entity.ParticipantMission, error)
	Update(ctx context.Context, m *entity.ParticipantMission) error
	// ReplaceByReport atomically replaces all participant missions for a report
	// within a single transaction (delete existing, insert the given items).
	ReplaceByReport(ctx context.Context, reportID string, items []entity.ParticipantMission) error
	// ListByParticipant returns all participant missions for a participant.
	ListByParticipant(ctx context.Context, participantID string) ([]entity.ParticipantMission, error)
	Delete(ctx context.Context, id string) error
}
