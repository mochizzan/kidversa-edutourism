package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterAssessmentRoutes mounts /api/assessments/* on the given echo group.
func RegisterAssessmentRoutes(g *echo.Group, h *AssessmentHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	scopeMW := appmiddleware.TenantScope()
	g.POST("/upsert", h.Upsert, authMW, scopeMW)
	g.POST("/bulk-upsert", h.BulkUpsert, authMW, scopeMW)
	g.GET("", h.List, authMW, scopeMW)
	g.DELETE("/:id", h.Delete, authMW, scopeMW)
}
