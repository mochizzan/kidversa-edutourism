package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// LiveFilter narrows live progress/timeline queries by session + optional group.
type LiveFilter struct {
	SessionID string
	GroupID   string
}

// LiveRepository provides persistence for live session state:
// group-stage progress, timeline events, and the session-group (for current stage).
type LiveRepository interface {
	// Progress.
	GetProgressBySession(ctx context.Context, sessionID string) ([]entity.GroupStageProgress, error)
	GetProgressByGroup(ctx context.Context, groupID string) ([]entity.GroupStageProgress, error)
	UpsertProgress(ctx context.Context, p *entity.GroupStageProgress) error

	// Groups (for current stage + status).
	GetGroup(ctx context.Context, groupID string) (*entity.SessionGroup, error)
	ListGroups(ctx context.Context, sessionID string) ([]entity.SessionGroup, error)
	UpdateGroup(ctx context.Context, g *entity.SessionGroup) error

	// TenantIDForSession resolves the owning tenant of a session (for SSE scope checks).
	TenantIDForSession(ctx context.Context, sessionID string) (string, error)

	// Timeline.
	ListTimeline(ctx context.Context, sessionID string, limit int) ([]entity.TimelineEvent, error)
	CreateTimeline(ctx context.Context, e *entity.TimelineEvent) error
}

// NotificationRepository persists user notifications (SSE + list).
type NotificationRepository interface {
	Create(ctx context.Context, n *entity.Notification) error
	ListByRecipient(ctx context.Context, userID string, since string, limit int) ([]entity.Notification, error)
	CountUnread(ctx context.Context, userID string) (int64, error)
	MarkRead(ctx context.Context, id, userID string) error
	MarkAllRead(ctx context.Context, userID string) error
}
