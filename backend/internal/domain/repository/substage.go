package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ProgramSubstageRepository is the persistence contract for Kegiatan
// (assessed leaves under a Topik).
// SubstageFilter narrows a paginated Kegiatan list query.
type SubstageFilter struct {
	ProgramID      string
	ProgramStageID string
	Search         string
	// TenantID scopes the result to substages whose Topik belongs to a
	// program owned by that tenant (Tahap 1 tenant isolation on the
	// global /api/program-substages list).
	TenantID string
}

type ProgramSubstageRepository interface {
	CreateSubstage(ctx context.Context, s *entity.ProgramSubstage) error
	GetSubstageByID(ctx context.Context, id string) (*entity.ProgramSubstage, error)
	ListSubstages(ctx context.Context, programStageID string) ([]entity.ProgramSubstage, error)
	ListPaginatedSubstages(ctx context.Context, filter SubstageFilter, page, limit int) (*Paginated[entity.ProgramSubstage], error)
	UpdateSubstage(ctx context.Context, s *entity.ProgramSubstage) error
	DeleteSubstage(ctx context.Context, id string) error
	// CountSubstageUsage returns how many live session_substages rows still
	// reference the Kegiatan. The guard behind DELETE /api/program-substages/:id
	// (409 substage_has_sessions when > 0).
	CountSubstageUsage(ctx context.Context, substageID string) (int64, error)
	// ListSubstageSessionBriefs returns up to limit live sessions that use the
	// Kegiatan (id, name, status) so the 409 can carry a short session list.
	ListSubstageSessionBriefs(ctx context.Context, substageID string, limit int) ([]entity.Session, error)
}

// SessionSubstageRepository is the persistence contract for session Kegiatan
// (instantiated Kegiatan within a session) and participant badge awards.
type SessionSubstageRepository interface {
	// Session Kegiatan.
	CreateSessionSubstage(ctx context.Context, s *entity.SessionSubstage) error
	ListSessionSubstages(ctx context.Context, sessionID string) ([]entity.SessionSubstage, error)
	GetSessionSubstage(ctx context.Context, id string) (*entity.SessionSubstage, error)
	// GetSessionSubstageByKeys returns the session_substage for a (session, program_substage) pair.
	GetSessionSubstageByKeys(ctx context.Context, sessionID, programSubstageID string) (*entity.SessionSubstage, error)
	UpdateSessionSubstage(ctx context.Context, s *entity.SessionSubstage) error

	// Participant badges.
	CreateBadge(ctx context.Context, b *entity.ParticipantBadge) error
	GetBadge(ctx context.Context, id string) (*entity.ParticipantBadge, error)
	// ListBadgesByParticipant returns every badge of a participant, optionally
	// scoped to the tenant that owns the participant (empty = tenant-less path).
	ListBadgesByParticipant(ctx context.Context, participantID, tenantID string) ([]entity.ParticipantBadge, error)
	// ListBadgesByParticipantStage returns the Kegiatan badge for a participant
	// on a specific Topik (unique per the uq_participant_subtopik_badge index).
	ListBadgesByParticipantStage(ctx context.Context, participantID, programStageID string) ([]entity.ParticipantBadge, error)
	// ListFinalBadgesByParticipant returns FINAL badges for a participant (one per program).
	ListFinalBadgesByParticipant(ctx context.Context, participantID, programID string) ([]entity.ParticipantBadge, error)
	// RevokeFinalBadge revokes (soft-deletes via deleted_at) every FINAL badge
	// of a participant on a program — the reconcile counterpart of CreateBadge,
	// used when the program is no longer fully assessed (e.g. it grew Topik
	// after the badge was earned). Scope mirrors ListFinalBadgesByParticipant;
	// a no-op when no FINAL row exists, an explicit error on write failure.
	RevokeFinalBadge(ctx context.Context, participantID, programID string) error
}
