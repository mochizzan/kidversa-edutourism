package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterContentsRoutes mounts the standalone content endpoints:
//   - GET    /api/contents                       (Manager list, tenant-scoped)
//   - POST   /api/contents                       (create, JSON; YouTube url)
//   - PUT    /api/contents/:id                   (update global fields)
//   - DELETE /api/contents/:id                   (hard-delete + unassign all)
//   - GET    /api/contents/:id/usage             (delete-confirm usage list)
//   - POST   /api/contents/upload                 (multipart upload -> Content)
//   - POST   /api/program-stages/:stageId/contents/assign   (stage assign)
//   - DELETE /api/program-stages/:stageId/contents/:contentId (stage unassign)
//
// The stage-scoped list GET /api/program-stages/:stageId/contents remains in
// router_programs.go (kiosk/learner path).
func RegisterContentsRoutes(g *echo.Group, h *ContentHandler, uploadH *UploadHandler, programH *ProgramHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	roleMW := appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN", "KOORDINATOR")
	scopeMW := appmiddleware.TenantScope()

	// Standalone content CRUD (tenant-scoped via JWT/scope).
	g.GET("/contents", h.List, authMW, roleMW, scopeMW)
	g.POST("/contents", h.Create, authMW, roleMW, scopeMW)
	g.PUT("/contents/:id", h.Update, authMW, roleMW, scopeMW)
	g.DELETE("/contents/:id", h.Delete, authMW, roleMW, scopeMW)
	g.GET("/contents/:id/usage", h.Usage, authMW, roleMW, scopeMW)

	// Content-level multipart upload (reuses the upload handler's UploadContentFile).
	g.POST("/contents/upload", uploadH.UploadContentFile, authMW, roleMW, scopeMW)

	// Stage assignment (junction). Assign/unassign live on the program handler.
	g.POST("/program-stages/:stageId/contents/assign", programH.AssignContent, authMW, roleMW, scopeMW)
	g.DELETE("/program-stages/:stageId/contents/:contentId", programH.UnassignContent, authMW, roleMW, scopeMW)
}
