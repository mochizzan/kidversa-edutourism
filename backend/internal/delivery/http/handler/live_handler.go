package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"github.com/google/uuid"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/live"
)

// LiveHandler serves /api/live/* (dashboard state + SSE).
type LiveHandler struct {
	svc *live.Service
	hub *sse.Hub
}

// NewLiveHandler builds the live handler.
func NewLiveHandler(svc *live.Service, hub *sse.Hub) *LiveHandler {
	return &LiveHandler{svc: svc, hub: hub}
}

// Groups handles GET /:sessionId/groups (dashboard snapshot of groups).
func (h *LiveHandler) Groups(c *echo.Context) error {
	sessionID := (*c).Param("sessionId")
	snap, err := h.svc.Snapshot((*c).Request().Context(), sessionID)
	if err != nil {
		return err
	}
	return appresp.OK(c, map[string]interface{}{"groups": snap.Groups})
}

// Timeline handles GET /:sessionId/timeline (recent timeline events).
func (h *LiveHandler) Timeline(c *echo.Context) error {
	sessionID := (*c).Param("sessionId")
	snap, err := h.svc.Snapshot((*c).Request().Context(), sessionID)
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
	p, err := h.svc.OverrideStage((*c).Request().Context(), groupID, stageID, action, actorID)
	if err != nil {
		return err
	}
	return appresp.OK(c, p)
}

// Jump handles POST /groups/:groupId/jump.
func (h *LiveHandler) Jump(c *echo.Context) error {
	var req dto.LiveJumpRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	groupID := (*c).Param("groupId")
	actorID := appmiddleware.GetUserID(c)
	if err := h.svc.Jump((*c).Request().Context(), groupID, req.StageID, actorID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// Reset handles POST /groups/:groupId/reset.
func (h *LiveHandler) Reset(c *echo.Context) error {
	groupID := (*c).Param("groupId")
	actorID := appmiddleware.GetUserID(c)
	if err := h.svc.Reset((*c).Request().Context(), groupID, actorID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// PublishEvent handles POST /events (create + broadcast a timeline event).
func (h *LiveHandler) PublishEvent(c *echo.Context) error {
	var req dto.LiveEventRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
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
	ec, unsub, err := h.hub.Subscribe((*c).Request().Context(), ch)
	if err != nil {
		return appresp.Fail(c, http.StatusInternalServerError, "internal_error")
	}
	defer unsub()

	w := (*c).Response()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher := getFlusher(w)
	flusher.Flush()

	// Initial snapshot.
	snap, err := h.svc.Snapshot((*c).Request().Context(), sessionID)
	if err == nil {
		writeSSE(w, flusher, sse.Event{Type: "snapshot", Data: snap})
	}

	keep := time.NewTicker(15 * time.Second)
	defer keep.Stop()
	for {
		select {
		case <-(*c).Request().Context().Done():
			return nil
		case ev := <-ec:
			writeSSE(w, flusher, ev)
		case <-keep.C:
			fmt.Fprintf(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}
