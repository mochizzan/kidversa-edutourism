package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ProgramSubstageRepository is the persistence contract for program substages
// (Kegiatan leaves under a SubTopik stage).
type ProgramSubstageRepository interface {
	CreateSubstage(ctx context.Context, s *entity.ProgramSubstage) error
	GetSubstageByID(ctx context.Context, id string) (*entity.ProgramSubstage, error)
	ListSubstages(ctx context.Context, programStageID string) ([]entity.ProgramSubstage, error)
	UpdateSubstage(ctx context.Context, s *entity.ProgramSubstage) error
	DeleteSubstage(ctx context.Context, id string) error
	// ReorderSubstages renumbers sequence_order 1..n to match orderedIDs.
	ReorderSubstages(ctx context.Context, programStageID string, orderedIDs []string) error
}

// SessionSubstageRepository is the persistence contract for session substages
// (instantiated Kegiatan within a session) and participant badge awards.
type SessionSubstageRepository interface {
	// Session substages.
	CreateSessionSubstage(ctx context.Context, s *entity.SessionSubstage) error
	ListSessionSubstages(ctx context.Context, sessionID string) ([]entity.SessionSubstage, error)
	GetSessionSubstage(ctx context.Context, id string) (*entity.SessionSubstage, error)
	// GetSessionSubstageByKeys returns the session_substage for a (session, program_substage) pair.
	GetSessionSubstageByKeys(ctx context.Context, sessionID, programSubstageID string) (*entity.SessionSubstage, error)
	UpdateSessionSubstage(ctx context.Context, s *entity.SessionSubstage) error

	// Participant badges.
	CreateBadge(ctx context.Context, b *entity.ParticipantBadge) error
	GetBadge(ctx context.Context, id string) (*entity.ParticipantBadge, error)
	ListBadgesByParticipant(ctx context.Context, participantID string) ([]entity.ParticipantBadge, error)
	// ListBadgesByParticipantStage returns the SUBTOPIK badge for a participant
	// on a specific program_stage (unique per the uq_participant_subtopik_badge index).
	ListBadgesByParticipantStage(ctx context.Context, participantID, programStageID string) ([]entity.ParticipantBadge, error)
	// ListFinalBadgesByParticipant returns FINAL badges for a participant (one per program).
	ListFinalBadgesByParticipant(ctx context.Context, participantID, programID string) ([]entity.ParticipantBadge, error)
}
