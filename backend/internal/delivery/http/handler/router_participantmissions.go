package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterParticipantMissionsRoutes mounts /api/participant-missions/* routes.
func RegisterParticipantMissionsRoutes(g *echo.Group, h *ParticipantMissionHandler, jm *auth.JWTManager) {
	g.POST("", h.Create, appmiddleware.JWTAuth(jm, ""))
	g.GET("", h.ListByReport, appmiddleware.JWTAuth(jm, ""))
	g.GET("/:id", h.GetByID, appmiddleware.JWTAuth(jm, ""))
	g.POST("/:id/toggle", h.Toggle, appmiddleware.JWTAuth(jm, ""))
	g.DELETE("/:id", h.Delete, appmiddleware.JWTAuth(jm, ""))
}
