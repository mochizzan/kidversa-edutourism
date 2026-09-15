package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ReportFilter narrows a report list query.
type ReportFilter struct {
	ParticipantID  string
	SessionID      string
	ProgramStageID string
	Status         string
	TenantID       string
}

// ReportRepository is the persistence contract for reports + parent access tokens.
type ReportRepository interface {
	Create(ctx context.Context, r *entity.Report) error
	// GetOrCreateDraft returns the existing report (any status) for the given
	// participant+session+topic (program_stage), or creates a DRAFT if none exists.
	// The existence check and insert are a single atomic DB op (ON CONFLICT DO NOTHING)
	// keyed on uq_reports_session_participant_topic so concurrent GenerateForSession
	// calls cannot both insert and hit the unique constraint.
	// programStageID may be "" for legacy whole-session reports.
	GetOrCreateDraft(ctx context.Context, participantID, sessionID, programStageID string) (*entity.Report, error)
	GetByID(ctx context.Context, id, tenantID string) (*entity.Report, error)
	// GetByIDPublic fetches a report by ID without tenant scoping.
	// Used by the gallery handler where the gallery token is the sole access control.
	GetByIDPublic(ctx context.Context, id string) (*entity.Report, error)
	// GetByToken resolves a report by a valid, unrevoked, unexpired parent token.
	GetByToken(ctx context.Context, token string) (*entity.Report, error)
	List(ctx context.Context, f ReportFilter, page, limit int) (*Paginated[entity.Report], error)
	Update(ctx context.Context, r *entity.Report) error
	Delete(ctx context.Context, id string) error
}

// ParticipantMissionRepository links reports to completed missions.
// Every method is tenant-scoped: operations assert report ownership via
// reportRepo.GetByID(reportID, tenantID) (returns 404 for cross-tenant) before
// acting by report_id. This keeps participant_missions 3NF off report_id with no
// denormalized tenant_id column.
type ParticipantMissionRepository interface {
	Create(ctx context.Context, tenantID string, m *entity.ParticipantMission) error
	GetByID(ctx context.Context, tenantID, id string) (*entity.ParticipantMission, error)
	GetByReport(ctx context.Context, tenantID, reportID string) ([]entity.ParticipantMission, error)
	Update(ctx context.Context, tenantID string, m *entity.ParticipantMission) error
	// ReplaceByReport atomically replaces all participant missions for a report
	// within a single transaction (delete existing, insert the given items).
	ReplaceByReport(ctx context.Context, tenantID, reportID string, items []entity.ParticipantMission) error
	// ListByParticipant returns all participant missions for a participant.
	ListByParticipant(ctx context.Context, tenantID, participantID string) ([]entity.ParticipantMission, error)
	Delete(ctx context.Context, tenantID, id string) error
}
