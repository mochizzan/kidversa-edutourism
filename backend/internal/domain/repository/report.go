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
}

// ReportRepository is the persistence contract for reports + parent access tokens.
type ReportRepository interface {
	Create(ctx context.Context, r *entity.Report) error
	GetByID(ctx context.Context, id string) (*entity.Report, error)
	// GetByToken resolves a report by a valid, unrevoked, unexpired parent token.
	GetByToken(ctx context.Context, token string) (*entity.Report, error)
	List(ctx context.Context, f ReportFilter, page, limit int) (*Paginated[entity.Report], error)
	Update(ctx context.Context, r *entity.Report) error
	Delete(ctx context.Context, id string) error
}

// ParticipantMissionFilter narrows a participant-mission list query.
type ParticipantMissionFilter struct {
	ParticipantID string
	ReportID      string
}

// ParticipantMissionRepository links reports to completed missions.
type ParticipantMissionRepository interface {
	Create(ctx context.Context, m *entity.ParticipantMission) error
	GetByID(ctx context.Context, id string) (*entity.ParticipantMission, error)
	GetByReport(ctx context.Context, reportID string) ([]entity.ParticipantMission, error)
	Update(ctx context.Context, m *entity.ParticipantMission) error
	Delete(ctx context.Context, id string) error
}
