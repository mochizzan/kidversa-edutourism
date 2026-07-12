package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterConsentRoutes mounts /api/consent/* on the given echo group.
func RegisterConsentRoutes(g *echo.Group, h *ConsentHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	g.POST("/respond", h.Respond, appmiddleware.JWTAuth(jm, "", revoker))
	g.GET("", h.ListByParticipant, appmiddleware.JWTAuth(jm, "", revoker))
}
