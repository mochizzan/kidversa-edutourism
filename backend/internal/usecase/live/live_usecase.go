package live

import (
	"context"
	"errors"
	"log"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
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

// GroupWithProgress bundles a session group with its live progress and
// participants for the live snapshot. Field names match the frontend
// LiveGroupWithProgress contract ({ group, progress, participants }).
type GroupWithProgress struct {
	Group        entity.SessionGroup         `json:"group"`
	Progress     []entity.GroupStageProgress `json:"progress"`
	Participants []entity.Participant        `json:"participants"`
}

// LiveSnapshot is the one-shot DB read sent to SSE clients on connect.
type LiveSnapshot struct {
	Groups   []GroupWithProgress         `json:"groups"`
	Progress []entity.GroupStageProgress `json:"progress"`
	Timeline []entity.TimelineEvent      `json:"timeline"`
}

// Snapshot reads the current live state of a session from the DB, tenant-scoped.
// Groups are assembled with their per-group progress and participants so the
// frontend receives the wrapped LiveGroupWithProgress shape it expects.
func (s *Service) Snapshot(ctx context.Context, sessionID, callerTenant string) (*LiveSnapshot, error) {
	if err := s.assertTenant(ctx, sessionID, callerTenant); err != nil {
		return nil, err
	}
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
	wrapped := make([]GroupWithProgress, 0, len(groups))
	for i := range groups {
		g := groups[i]
		gp, gerr := s.repo.GetProgressByGroup(ctx, g.ID)
		if gerr != nil {
			return nil, gerr
		}
		parts, perr := s.repo.ListParticipants(ctx, sessionID, g.ID)
		if perr != nil {
			return nil, perr
		}
		wrapped = append(wrapped, GroupWithProgress{
			Group:        g,
			Progress:     gp,
			Participants: parts,
		})
	}
	return &LiveSnapshot{Groups: wrapped, Progress: progress, Timeline: timeline}, nil
}

// OverrideAction is a facilitator override on a group-stage.
type OverrideAction string

const (
	ActionUnlock   OverrideAction = "unlock"
	ActionComplete OverrideAction = "complete"
	ActionSkip     OverrideAction = "skip"
)

// OverrideStage applies a facilitator override to a group-stage and broadcasts it.
// The session is resolved from the group's owning session. callerTenant is the
// resolved tenant from the JWT/scope; an owning-tenant mismatch is rejected.
func (s *Service) OverrideStage(ctx context.Context, groupID, stageID string, action OverrideAction, actorID, callerTenant string) (*entity.GroupStageProgress, error) {
	g, err := s.repo.GetGroup(ctx, groupID)
	if err != nil {
		return nil, err
	}
	if err := s.assertTenant(ctx, g.SessionID, callerTenant); err != nil {
		return nil, err
	}
	progress, _ := s.repo.GetProgressByGroup(ctx, groupID)
	p := findProgress(progress, stageID)
	if p == nil {
		p = &entity.GroupStageProgress{GroupID: groupID, SessionStageID: stageID, Status: entity.ProgressLocked}
	}
	now := apputil.Now()
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
func (s *Service) Jump(ctx context.Context, groupID, stageID, actorID, callerTenant string) error {
	g, err := s.repo.GetGroup(ctx, groupID)
	if err != nil {
		return err
	}
	if err := s.assertTenant(ctx, g.SessionID, callerTenant); err != nil {
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
func (s *Service) Reset(ctx context.Context, groupID, actorID, callerTenant string) error {
	g, err := s.repo.GetGroup(ctx, groupID)
	if err != nil {
		return err
	}
	if err := s.assertTenant(ctx, g.SessionID, callerTenant); err != nil {
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
	s.publish(ctx, sessionID, "timeline:"+string(e.Type), e)
	return nil
}

// MarkRead marks a single notification read.
func (s *Service) MarkRead(ctx context.Context, id, userID string) error {
	return s.notif.MarkRead(ctx, id, userID)
}

// MarkAllRead marks every notification for a recipient read.
func (s *Service) MarkAllRead(ctx context.Context, userID string) error {
	if err := s.notif.MarkAllRead(ctx, userID); err != nil {
		return err
	}
	s.publishNotif(ctx, userID, sse.Event{
		Type: entity.EventNotifUpdate,
		Data: map[string]string{"action": "read-all"},
	})
	return nil
}

// DismissApproval removes pending-approval notifications for targetUserID and
// notifies each affected approver to refetch. Best-effort (returns repo errors).
func (s *Service) DismissApproval(ctx context.Context, targetUserID string) error {
	recipients, err := s.notif.DeleteByRefAndType(ctx, targetUserID, entity.NotifTypeUserPendingApproval)
	if err != nil {
		return err
	}
	for _, rid := range recipients {
		s.publishNotif(ctx, rid, sse.Event{
			Type: entity.EventNotifUpdate,
			Data: map[string]string{"type": entity.NotifTypeUserPendingApproval, "ref_id": targetUserID},
		})
	}
	return nil
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
	if err := s.hub.Publish(ctx, sse.LiveChannel(sessionID), sse.Event{Type: typ, Data: data}); err != nil {
		log.Printf("live: SSE publish failed for session %s: %v", sessionID, err)
	}
}

// publishNotif publishes an event on a single user's notification channel.
func (s *Service) publishNotif(ctx context.Context, userID string, ev sse.Event) {
	if err := s.hub.Publish(ctx, sse.NotifChannel(userID), ev); err != nil {
		log.Printf("live: SSE notif publish failed for user %s: %v", userID, err)
	}
}

func findProgress(list []entity.GroupStageProgress, stageID string) *entity.GroupStageProgress {
	for i := range list {
		if list[i].SessionStageID == stageID {
			return &list[i]
		}
	}
	return nil
}

// assertTenant resolves the owning tenant of sessionID and compares it against the
// caller's resolved tenant. tenant-less SUPER_ADMIN (callerTenant == "") is allowed
// through (scoped by the X-Tenant-Id header via TenantScope middleware when present).
func (s *Service) assertTenant(ctx context.Context, sessionID, callerTenant string) error {
	if callerTenant == "" {
		return nil
	}
	owner, err := s.repo.TenantIDForSession(ctx, sessionID)
	if err != nil {
		return err
	}
	if owner != callerTenant {
		return apperrors.Forbidden("forbidden", errors.New("tenant mismatch"))
	}
	return nil
}
