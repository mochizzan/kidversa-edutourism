package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

// RegisterNotificationsRoutes mounts /api/notifications/* on the given echo group.
func RegisterNotificationsRoutes(g *echo.Group, h *NotificationHandler, jm *auth.JWTManager, hub *sse.Hub, revoker auth.TokenRevoker) {
	_ = hub // hub is held by the handler for SSE streaming.
	authM := appmiddleware.JWTAuth(jm, "", revoker)
	g.GET("", h.List, authM)
	g.GET("/stream", h.Stream, authM)
	g.POST("/:id/read", h.MarkRead, authM)
	g.POST("/read-all", h.MarkAllRead, authM)
}
