package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterAssessmentRoutes mounts /api/assessments/* on the given echo group.
func RegisterAssessmentRoutes(g *echo.Group, h *AssessmentHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	g.POST("/upsert", h.Upsert, appmiddleware.JWTAuth(jm, "", revoker))
	g.POST("/bulk-upsert", h.BulkUpsert, appmiddleware.JWTAuth(jm, "", revoker))
	g.GET("", h.List, appmiddleware.JWTAuth(jm, "", revoker))
	g.DELETE("/:id", h.Delete, appmiddleware.JWTAuth(jm, "", revoker))
}
