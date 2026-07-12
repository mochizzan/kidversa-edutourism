package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterProgramsRoutes mounts /api/programs/* and /api/program-stages/* on the given echo group.
// All program operations require SUPER_ADMIN, ADMIN, or KOORDINATOR; tenant scope is enforced
// by TenantScope (programs filtered by GetTenantID; stages/contents scoped through their program).
func RegisterProgramsRoutes(g *echo.Group, h *ProgramHandler, jm *auth.JWTManager) {
	authMW := appmiddleware.JWTAuth(jm, "")
	roleMW := appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN", "KOORDINATOR")
	scopeMW := appmiddleware.TenantScope()

	// Programs.
	g.GET("", h.List, authMW, roleMW, scopeMW)
	g.POST("", h.Create, authMW, roleMW, scopeMW)
	g.GET("/:id", h.Get, authMW, roleMW, scopeMW)
	g.PUT("/:id", h.Update, authMW, roleMW, scopeMW)
	g.POST("/:id/toggle-active", h.ToggleActive, authMW, roleMW, scopeMW)
	g.DELETE("/:id", h.Delete, authMW, roleMW, scopeMW)

	// Stages nested under a program.
	g.GET("/:id/stages", h.ListStages, authMW, roleMW, scopeMW)
	g.POST("/:id/stages", h.CreateStage, authMW, roleMW, scopeMW)
	g.PUT("/:id/stages/:stageId", h.UpdateStage, authMW, roleMW, scopeMW)
	g.DELETE("/:id/stages/:stageId", h.DeleteStage, authMW, roleMW, scopeMW)
	g.POST("/:id/stages/reorder", h.ReorderStages, authMW, roleMW, scopeMW)

	// Contents keyed directly by stage (separate base path).
	g.GET("/program-stages/:stageId/contents", h.ListContents, authMW, roleMW, scopeMW)
	g.POST("/program-stages/:stageId/contents", h.CreateContent, authMW, roleMW, scopeMW)
	g.PUT("/program-stages/:stageId/contents/:contentId", h.UpdateContent, authMW, roleMW, scopeMW)
	g.DELETE("/program-stages/:stageId/contents/:contentId", h.DeleteContent, authMW, roleMW, scopeMW)
	g.POST("/program-stages/:stageId/contents/reorder", h.ReorderContents, authMW, roleMW, scopeMW)
}
