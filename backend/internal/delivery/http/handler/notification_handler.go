package handler

import (
	"fmt"
	"net/http"
	"time"

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
	f := getFlusher(w)
	f.Flush()

	keep := time.NewTicker(15 * time.Second)
	defer keep.Stop()
	for {
		select {
		case <-(*c).Request().Context().Done():
			return nil
		case ev := <-ec:
			writeSSE(w, f, ev)
		case <-keep.C:
			fmt.Fprintf(w, ": keepalive\n\n")
			f.Flush()
		}
	}
}
