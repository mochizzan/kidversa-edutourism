package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// AssessmentFilter narrows an assessment list query.
type AssessmentFilter struct {
	ParticipantID     string
	SessionID         string
	SessionSubstageID string
	// ProgramStageID scopes assessments to a single Topic (program_stage) by
	// joining assessments -> session_substages -> session_stages -> program_stages.
	// Enforces per-Topic report scoping structurally (no data leakage across Topics).
	ProgramStageID string
	// TenantID scopes the list to a tenant via session_id->sessions.tenant_id.
	// It must be set by the handler (populated from the JWT/scope); an empty
	// TenantID is rejected at the repo as defense-in-depth against cross-tenant
	// READ IDOR (GET /api/assessments?participant_id=<any-uuid>).
	TenantID string
}

// AssessmentRepository is the persistence contract for assessments.
type AssessmentRepository interface {
	Create(ctx context.Context, a *entity.Assessment) error
	GetByID(ctx context.Context, id, tenantID string) (*entity.Assessment, error)
	GetByParticipantStage(ctx context.Context, participantID, sessionSubstageID, tenantID string) (*entity.Assessment, error)
	GetByParticipantStageIncludingDeleted(ctx context.Context, participantID, sessionSubstageID, tenantID string) (*entity.Assessment, error)
	List(ctx context.Context, f AssessmentFilter, page, limit int) (*Paginated[entity.Assessment], error)
	Update(ctx context.Context, a *entity.Assessment) error
	// Revive restores a soft-deleted assessment (clears deleted_at) and writes
	// the new values in one pass. Used by the upsert path so re-assessing a child
	// after a delete does not collide on the unique key (OQ3, Option A: keep
	// soft-delete, no generated column).
	Revive(ctx context.Context, a *entity.Assessment) error
	Delete(ctx context.Context, id string) error
	// GetGroupFacilitatorIDByParticipant resolves the facilitator_id of the group a
	// participant belongs to (via participants.group_id -> session_groups.facilitator_id).
	// Returns nil if the participant has no group or the group has no facilitator.
	GetGroupFacilitatorIDByParticipant(ctx context.Context, participantID string) (*string, error)
}
