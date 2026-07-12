package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterParticipantMissionsRoutes mounts /api/participant-missions/* routes.
func RegisterParticipantMissionsRoutes(g *echo.Group, h *ParticipantMissionHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	g.POST("", h.Create, appmiddleware.JWTAuth(jm, "", revoker))
	g.GET("", h.ListByReport, appmiddleware.JWTAuth(jm, "", revoker))
	g.GET("/:id", h.GetByID, appmiddleware.JWTAuth(jm, "", revoker))
	g.POST("/:id/toggle", h.Toggle, appmiddleware.JWTAuth(jm, "", revoker))
	g.DELETE("/:id", h.Delete, appmiddleware.JWTAuth(jm, "", revoker))
}
