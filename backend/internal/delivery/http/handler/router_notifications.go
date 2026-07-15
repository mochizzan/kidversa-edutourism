package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

// RegisterNotificationsRoutes mounts /api/notifications/* on the given echo group.
// Notifications are intentionally user-scoped (keyed by userID from the JWT), NOT
// tenant-scoped: a notification targets exactly one recipient, so TenantScope
// filtering is unnecessary and would add no protection. Every handler resolves
// the caller's userID from the JWT and never exposes another user's rows.
//
// SSE cookie auth is enabled (sseCookieName from cfg) so the browser's
// EventSource (which cannot send an Authorization header) can authenticate via
// the kidversa_session cookie on GET /stream.
func RegisterNotificationsRoutes(g *echo.Group, h *NotificationHandler, jm *auth.JWTManager, _ *sse.Hub, cfg *config.Config, revoker auth.TokenRevoker) {
	authM := appmiddleware.JWTAuth(jm, cfg.SSECookieName(), revoker)
	g.GET("", h.List, authM)
	g.GET("/stream", h.Stream, authM)
	g.POST("/:id/read", h.MarkRead, authM)
	g.POST("/read-all", h.MarkAllRead, authM)
}
