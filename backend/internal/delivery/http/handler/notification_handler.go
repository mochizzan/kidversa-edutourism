package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/live"
)

// NotificationHandler serves /api/notifications/* (SSE + list/mark-read).
type NotificationHandler struct {
	svc *live.Service
	hub *sse.Hub
}

// NewNotificationHandler builds the notification handler.
func NewNotificationHandler(svc *live.Service, hub *sse.Hub) *NotificationHandler {
	return &NotificationHandler{svc: svc, hub: hub}
}

// List handles GET /api/notifications (fetch + unread count, ?since= optional).
func (h *NotificationHandler) List(c *echo.Context) error {
	uid := appmiddleware.GetUserID(c)
	since := (*c).QueryParam("since")
	limit := queryInt(c, "limit", 50)
	items, unread, err := h.svc.Notifications((*c).Request().Context(), uid, since, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, items, &appresp.Meta{Total: int(unread)})
}

// MarkRead handles POST /api/notifications/:id/read.
func (h *NotificationHandler) MarkRead(c *echo.Context) error {
	id := (*c).Param("id")
	uid := appmiddleware.GetUserID(c)
	if err := h.svc.MarkRead((*c).Request().Context(), id, uid); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// MarkAllRead handles POST /api/notifications/read-all.
func (h *NotificationHandler) MarkAllRead(c *echo.Context) error {
	uid := appmiddleware.GetUserID(c)
	if err := h.svc.MarkAllRead((*c).Request().Context(), uid); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// Stream handles GET /api/notifications/stream (SSE to notif:<userId>).
func (h *NotificationHandler) Stream(c *echo.Context) error {
	uid := appmiddleware.GetUserID(c)
	ch := sse.NotifChannel(uid)
	return streamSSE(c, h.hub, ch, nil, sseKeepaliveSec)
}
