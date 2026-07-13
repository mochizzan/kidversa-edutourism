package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

// RegisterNotificationsRoutes mounts /api/notifications/* on the given echo group.
// Notifications are intentionally user-scoped (keyed by userID from the JWT), NOT
// tenant-scoped: a notification targets exactly one recipient, so TenantScope
// filtering is unnecessary and would add no protection. Every handler resolves
// the caller's userID from the JWT and never exposes another user's rows.
func RegisterNotificationsRoutes(g *echo.Group, h *NotificationHandler, jm *auth.JWTManager, hub *sse.Hub, revoker auth.TokenRevoker) {
	_ = hub // hub is held by the handler for SSE streaming.
	authM := appmiddleware.JWTAuth(jm, "", revoker)
	g.GET("", h.List, authM)
	g.GET("/stream", h.Stream, authM)
	g.POST("/:id/read", h.MarkRead, authM)
	g.POST("/read-all", h.MarkAllRead, authM)
}
