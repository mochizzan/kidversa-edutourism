package live

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/pkg/sse"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
)

// Service implements live session + notification business logic.
type Service struct {
	repo  repository.LiveRepository
	notif repository.NotificationRepository
	hub   *sse.Hub
}

// NewService builds the live service.
func NewService(repo repository.LiveRepository, notif repository.NotificationRepository, hub *sse.Hub) *Service {
	return &Service{repo: repo, notif: notif, hub: hub}
}

// LiveSnapshot is the one-shot DB read sent to SSE clients on connect.
type LiveSnapshot struct {
	Groups   []entity.SessionGroup       `json:"groups"`
	Progress []entity.GroupStageProgress `json:"progress"`
	Timeline []entity.TimelineEvent      `json:"timeline"`
}

// Snapshot reads the current live state of a session from the DB.
func (s *Service) Snapshot(ctx context.Context, sessionID string) (*LiveSnapshot, error) {
	groups, err := s.repo.ListGroups(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	progress, err := s.repo.GetProgressBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	timeline, err := s.repo.ListTimeline(ctx, sessionID, 100)
	if err != nil {
		return nil, err
	}
	return &LiveSnapshot{Groups: groups, Progress: progress, Timeline: timeline}, nil
}

// OverrideAction is a facilitator override on a group-stage.
type OverrideAction string

const (
	ActionUnlock   OverrideAction = "unlock"
	ActionComplete OverrideAction = "complete"
	ActionSkip     OverrideAction = "skip"
)

// OverrideStage applies a facilitator override to a group-stage and broadcasts it.
// The session is resolved from the group's owning session.
func (s *Service) OverrideStage(ctx context.Context, groupID, stageID string, action OverrideAction, actorID string) (*entity.GroupStageProgress, error) {
	g, err := s.repo.GetGroup(ctx, groupID)
	if err != nil {
		return nil, err
	}
	progress, _ := s.repo.GetProgressByGroup(ctx, groupID)
	p := findProgress(progress, stageID)
	if p == nil {
		p = &entity.GroupStageProgress{GroupID: groupID, SessionStageID: stageID, Status: entity.ProgressLocked}
	}
	now := apputil.NowISO()
	p.UnlockedBy = &actorID
	p.UnlockReason = "override"
	switch action {
	case ActionUnlock:
		p.Status = entity.ProgressUnlocked
	case ActionComplete:
		p.Status = entity.ProgressCompleted
		p.CompletedAt = &now
	case ActionSkip:
		p.Status = entity.ProgressSkipped
	}
	if err := s.repo.UpsertProgress(ctx, p); err != nil {
		return nil, err
	}
	s.publish(ctx, g.SessionID, "stage:"+string(action), p)
	return p, nil
}

// Jump moves a group to a session stage (updates its current stage).
func (s *Service) Jump(ctx context.Context, groupID, stageID, actorID string) error {
	g, err := s.repo.GetGroup(ctx, groupID)
	if err != nil {
		return err
	}
	g.CurrentSessionStageID = &stageID
	if err := s.repo.UpdateGroup(ctx, g); err != nil {
		return err
	}
	s.publish(ctx, g.SessionID, "group:jump", g)
	return nil
}

// Reset clears a group's current stage (back to waiting).
func (s *Service) Reset(ctx context.Context, groupID, actorID string) error {
	g, err := s.repo.GetGroup(ctx, groupID)
	if err != nil {
		return err
	}
	g.CurrentSessionStageID = nil
	g.Status = entity.GroupWaiting
	if err := s.repo.UpdateGroup(ctx, g); err != nil {
		return err
	}
	s.publish(ctx, g.SessionID, "group:reset", g)
	return nil
}

// PublishEvent records + broadcasts an arbitrary live event for a session.
func (s *Service) PublishEvent(ctx context.Context, sessionID string, e *entity.TimelineEvent) error {
	if err := s.repo.CreateTimeline(ctx, e); err != nil {
		return err
	}
	s.publish(ctx, sessionID, "timeline:"+e.Type, e)
	return nil
}

// MarkRead marks a single notification read.
func (s *Service) MarkRead(ctx context.Context, id, userID string) error {
	return s.notif.MarkRead(ctx, id, userID)
}

// MarkAllRead marks every notification for a recipient read.
func (s *Service) MarkAllRead(ctx context.Context, userID string) error {
	return s.notif.MarkAllRead(ctx, userID)
}

// Notifications fetches a recipient's notifications and unread count.
func (s *Service) Notifications(ctx context.Context, userID, since string, limit int) ([]entity.Notification, int64, error) {
	if limit <= 0 {
		limit = 50
	}
	items, err := s.notif.ListByRecipient(ctx, userID, since, limit)
	if err != nil {
		return nil, 0, err
	}
	unread, err := s.notif.CountUnread(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	return items, unread, nil
}

func (s *Service) publish(ctx context.Context, sessionID, typ string, data interface{}) {
	_ = s.hub.Publish(ctx, sse.LiveChannel(sessionID), sse.Event{Type: typ, Data: data})
}

func findProgress(list []entity.GroupStageProgress, stageID string) *entity.GroupStageProgress {
	for i := range list {
		if list[i].SessionStageID == stageID {
			return &list[i]
		}
	}
	return nil
}
