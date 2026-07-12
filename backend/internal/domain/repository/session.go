package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// SessionFilter narrows a session list query.
type SessionFilter struct {
	TenantID    string
	Search      string
	Status      string
	SessionDate string
}

// GroupWithParticipants bundles a session group with its participants.
type GroupWithParticipants struct {
	SessionGroup entity.SessionGroup
	Participants []entity.Participant
}

// SessionDetail is the expanded session view (stages + groups + participants).
type SessionDetail struct {
	Session entity.Session
	Stages  []entity.SessionStage
	Groups  []GroupWithParticipants
}

// ParticipantInput is the payload for creating/importing a participant.
type ParticipantInput struct {
	ChildName        string  `json:"child_name"`
	ChildAge         int     `json:"child_age"`
	SchoolName       string  `json:"school_name,omitempty"`
	ParentName       string  `json:"parent_name"`
	ParentPhone      string  `json:"parent_phone"`
	ParentEmail      string  `json:"parent_email,omitempty"`
	ConsentRecording bool    `json:"consent_recording"`
	ConsentPhoto     bool    `json:"consent_photo"`
	GroupID          *string `json:"group_id,omitempty"`
}

// SessionRepository is the persistence contract for sessions and their sub-entities
// (stages, groups, group-stage progress, and participants).
type SessionRepository interface {
	// Sessions.
	CreateSession(ctx context.Context, s *entity.Session) error
	GetSessionByID(ctx context.Context, id string) (*entity.Session, error)
	ListSessions(ctx context.Context, f SessionFilter, page, limit int) (*Paginated[entity.Session], error)
	UpdateSession(ctx context.Context, s *entity.Session) error
	DeleteSession(ctx context.Context, id string) error

	// Session stages.
	CreateSessionStage(ctx context.Context, s *entity.SessionStage) error
	ListSessionStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error)
	UpdateSessionStage(ctx context.Context, s *entity.SessionStage) error

	// Session groups.
	CreateSessionGroup(ctx context.Context, g *entity.SessionGroup) error
	GetSessionGroupByID(ctx context.Context, id string) (*entity.SessionGroup, error)
	ListSessionGroups(ctx context.Context, sessionID string) ([]entity.SessionGroup, error)
	UpdateSessionGroup(ctx context.Context, g *entity.SessionGroup) error
	DeleteSessionGroup(ctx context.Context, id string) error

	// Group stage progress.
	CreateGroupStageProgress(ctx context.Context, p *entity.GroupStageProgress) error
	ListGroupStageProgress(ctx context.Context, sessionStageID string) ([]entity.GroupStageProgress, error)

	// Participants.
	CreateParticipant(ctx context.Context, p *entity.Participant) error
	GetParticipantByID(ctx context.Context, id string) (*entity.Participant, error)
	ListParticipants(ctx context.Context, sessionID, groupID string) ([]entity.Participant, error)
	ListParticipantsPaginated(ctx context.Context, tenantID, sessionID, groupID, search string, page, limit int) (*Paginated[entity.Participant], error)
	UpdateParticipant(ctx context.Context, p *entity.Participant) error
	DeleteParticipant(ctx context.Context, id string) error

	// Transaction helper: run fn inside a DB transaction (GORM-backed repos provide this).
	Transaction(ctx context.Context, fn func(tx SessionRepository) error) error

	// TenantIDForSession resolves the owning tenant of a session (for media scope checks).
	TenantIDForSession(ctx context.Context, sessionID string) (string, error)
}
