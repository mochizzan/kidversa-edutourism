package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterProgramsRoutes mounts /api/programs/* and /api/program-stages/* on the given echo group.
// Write operations require SUPER_ADMIN, ADMIN, or KOORDINATOR; read-only GETs on a program
// (detail and stages) also allow FASILITATOR. Tenant scope is enforced
// by TenantScope (programs filtered by GetTenantID; stages/contents scoped through their program).
func RegisterProgramsRoutes(g *echo.Group, h *ProgramHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	roleMWAdmin := appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN", "KOORDINATOR")
	roleMWRead := appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN", "KOORDINATOR", "FASILITATOR")
	scopeMW := appmiddleware.TenantScope()

	// Programs.
	g.GET("", h.List, authMW, roleMWAdmin, scopeMW)
	g.POST("", h.Create, authMW, roleMWAdmin, scopeMW)
	g.GET("/:id", h.Get, authMW, roleMWRead, scopeMW)
	g.PUT("/:id", h.Update, authMW, roleMWAdmin, scopeMW)
	g.POST("/:id/toggle-active", h.ToggleActive, authMW, roleMWAdmin, scopeMW)
	g.DELETE("/:id", h.Delete, authMW, roleMWAdmin, scopeMW)

	// Stages nested under a program.
	g.GET("/:id/stages", h.ListStages, authMW, roleMWRead, scopeMW)
	g.POST("/:id/stages", h.CreateStage, authMW, roleMWAdmin, scopeMW)
	g.PUT("/:id/stages/:stageId", h.UpdateStage, authMW, roleMWAdmin, scopeMW)
	g.DELETE("/:id/stages/:stageId", h.DeleteStage, authMW, roleMWAdmin, scopeMW)
	g.POST("/:id/stages/reorder", h.ReorderStages, authMW, roleMWAdmin, scopeMW)

	// Contents keyed directly by stage (separate base path).
	g.GET("/program-stages/:stageId/contents", h.ListContents, authMW, roleMWAdmin, scopeMW)
	g.POST("/program-stages/:stageId/contents", h.CreateContent, authMW, roleMWAdmin, scopeMW)
	g.PUT("/program-stages/:stageId/contents/:contentId", h.UpdateContent, authMW, roleMWAdmin, scopeMW)
	g.DELETE("/program-stages/:stageId/contents/:contentId", h.DeleteContent, authMW, roleMWAdmin, scopeMW)
	g.POST("/program-stages/:stageId/contents/reorder", h.ReorderContents, authMW, roleMWAdmin, scopeMW)
}
