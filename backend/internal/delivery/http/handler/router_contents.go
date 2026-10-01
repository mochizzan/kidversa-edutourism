package handler

import (
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterContentsRoutes mounts the standalone content endpoints:
//   - GET    /api/contents                       (Manager list, tenant-scoped)
//   - POST   /api/contents                       (create, JSON; YouTube url)
//   - PUT    /api/contents/:id                   (update global fields)
//   - DELETE /api/contents/:id                   (hard-delete + unassign all)
//   - GET    /api/contents/:id/usage             (delete-confirm usage list)
//   - POST   /api/contents/upload                 (multipart upload -> Content)
//
// Stage-scoped assign/unassign now live under /api/programs in
// RegisterProgramsRoutes (router_programs.go), matching the other
// stage-content endpoints (list, reorder).
func RegisterContentsRoutes(g *echo.Group, h *ContentHandler, uploadH *UploadHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	roleMW := appmiddleware.RequireRole(entity.RoleSuperAdmin, entity.RoleAdmin, entity.RoleKoordinator)
	scopeMW := appmiddleware.TenantScope()
	// Same UPLOAD_MAX_MB-derived echo BodyLimit as the photos/frames/avatar
	// routes (RegisterUploadRoutes in router_upload.go, same uploadMaxBodyBytes
	// helper): the two multipart upload routes below reject an oversized raw
	// body with 413 at the Content-Length check before the handler parses or
	// persists anything. The JSON CRUD routes intentionally stay unlimited,
	// mirroring the existing pattern.
	bodyMW := middleware.BodyLimit(uploadMaxBodyBytes(uploadH.cfg))

	// Standalone content CRUD (tenant-scoped via JWT/scope).
	g.GET("/contents", h.List, authMW, roleMW, scopeMW)
	g.POST("/contents", h.Create, authMW, roleMW, scopeMW)
	g.GET("/contents/:id", h.Get, authMW, roleMW, scopeMW)
	g.PUT("/contents/:id", h.Update, authMW, roleMW, scopeMW)
	g.DELETE("/contents/:id", h.Delete, authMW, roleMW, scopeMW)
	g.GET("/contents/:id/usage", h.Usage, authMW, roleMW, scopeMW)

	// Content-level multipart upload (reuses the upload handler's UploadContentFile).
	g.POST("/contents/upload", uploadH.UploadContentFile, authMW, roleMW, scopeMW, bodyMW)
	g.POST("/contents/:id/replace-file", uploadH.ReplaceContentFile, authMW, roleMW, scopeMW, bodyMW)
}
