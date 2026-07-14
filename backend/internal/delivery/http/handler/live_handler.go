package handler

import (
	"github.com/labstack/echo/v5"

	"github.com/google/uuid"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/live"
)

// LiveHandler serves /api/live/* (dashboard state + SSE).
type LiveHandler struct {
	svc     *live.Service
	hub     *sse.Hub
	keepaliveSec int
}

// NewLiveHandler builds the live handler. keepaliveSec is the idle interval at
// which the SSE stream emits keepalive comment frames (from config).
func NewLiveHandler(svc *live.Service, hub *sse.Hub, keepaliveSec int) *LiveHandler {
	return &LiveHandler{svc: svc, hub: hub, keepaliveSec: keepaliveSec}
}

// Groups handles GET /:sessionId/groups (dashboard snapshot of groups).
func (h *LiveHandler) Groups(c *echo.Context) error {
	sessionID := (*c).Param("sessionId")
	snap, err := h.svc.Snapshot((*c).Request().Context(), sessionID, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, map[string]interface{}{"groups": snap.Groups})
}

// Timeline handles GET /:sessionId/timeline (recent timeline events).
func (h *LiveHandler) Timeline(c *echo.Context) error {
	sessionID := (*c).Param("sessionId")
	snap, err := h.svc.Snapshot((*c).Request().Context(), sessionID, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, map[string]interface{}{"timeline": snap.Timeline})
}

// Override handles POST /groups/:groupId/stages/:stageId/{unlock,complete,skip}.
func (h *LiveHandler) Override(c *echo.Context, action live.OverrideAction) error {
	groupID := (*c).Param("groupId")
	stageID := (*c).Param("stageId")
	actorID := appmiddleware.GetUserID(c)
	p, err := h.svc.OverrideStage((*c).Request().Context(), groupID, stageID, action, actorID, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, p)
}

// Jump handles POST /groups/:groupId/jump.
func (h *LiveHandler) Jump(c *echo.Context) error {
	var req dto.LiveJumpRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	groupID := (*c).Param("groupId")
	actorID := appmiddleware.GetUserID(c)
	if err := h.svc.Jump((*c).Request().Context(), groupID, req.StageID, actorID, appmiddleware.GetTenantID(c)); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// Reset handles POST /groups/:groupId/reset.
func (h *LiveHandler) Reset(c *echo.Context) error {
	groupID := (*c).Param("groupId")
	actorID := appmiddleware.GetUserID(c)
	if err := h.svc.Reset((*c).Request().Context(), groupID, actorID, appmiddleware.GetTenantID(c)); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// PublishEvent handles POST /events (create + broadcast a timeline event).
func (h *LiveHandler) PublishEvent(c *echo.Context) error {
	var req dto.LiveEventRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	sessionID := (*c).Param("sessionId")
	e := &entity.TimelineEvent{
		BaseModel: entity.BaseModel{ID: uuid.NewString()}, SessionID: sessionID, GroupID: req.GroupID,
		Type: req.Type, Message: req.Message, UserID: appmiddleware.GetUserID(c),
	}
	if err := h.svc.PublishEvent((*c).Request().Context(), sessionID, e); err != nil {
		return err
	}
	return appresp.Created(c, e)
}

// Stream handles GET /:sessionId/stream (SSE: snapshot then live deltas).
func (h *LiveHandler) Stream(c *echo.Context) error {
	sessionID := (*c).Param("sessionId")
	ch := sse.LiveChannel(sessionID)

	// Initial snapshot is sent as the first event before streaming live deltas.
	var initial *sse.Event
	if snap, err := h.svc.Snapshot((*c).Request().Context(), sessionID, appmiddleware.GetTenantID(c)); err == nil {
		initial = &sse.Event{Type: "snapshot", Data: snap}
	}

	return streamSSE(c, h.hub, ch, initial, h.keepaliveSec)
}
