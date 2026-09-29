package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterParticipantMissionsRoutes mounts /api/participant-missions/* routes.
func RegisterParticipantMissionsRoutes(g *echo.Group, h *ParticipantMissionHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	scopeMW := appmiddleware.TenantScope()
	g.GET("", h.List, authMW, scopeMW)
	g.POST("/:id/toggle", h.Toggle, authMW, scopeMW)
}
