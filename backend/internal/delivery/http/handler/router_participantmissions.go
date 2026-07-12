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
	g.POST("", h.Create, authMW, scopeMW)
	g.GET("", h.List, authMW, scopeMW)
	g.POST("/replace", h.Replace, authMW, scopeMW)
	g.GET("/:id", h.GetByID, authMW, scopeMW)
	g.POST("/:id/toggle", h.Toggle, authMW, scopeMW)
	g.DELETE("/:id", h.Delete, authMW, scopeMW)
}
