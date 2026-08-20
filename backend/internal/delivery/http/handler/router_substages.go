package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterProgramSubstagesRoutes mounts /api/program-substages/* on the given echo group.
// Write ops require SUPER_ADMIN/ADMIN/KOORDINATOR; read (GET) also allows FASILITATOR.
// Every route is JWT + TenantScope guarded.
func RegisterProgramSubstagesRoutes(g *echo.Group, h *ProgramSubstageHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	roleMWAdmin := appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN", "KOORDINATOR")
	roleMWRead := appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN", "KOORDINATOR", "FASILITATOR")
	scopeMW := appmiddleware.TenantScope()

	g.GET("", h.List, authMW, roleMWRead, scopeMW)
	g.POST("", h.Create, authMW, roleMWAdmin, scopeMW)
	g.POST("/reorder", h.Reorder, authMW, roleMWAdmin, scopeMW)
	g.GET("/:id", h.Get, authMW, roleMWRead, scopeMW)
	g.PUT("/:id", h.Update, authMW, roleMWAdmin, scopeMW)
	g.DELETE("/:id", h.Delete, authMW, roleMWAdmin, scopeMW)
}

// RegisterBadgesRoutes mounts /api/badges/* on the given echo group (read-only).
// Every route is JWT + TenantScope guarded.
func RegisterBadgesRoutes(g *echo.Group, h *BadgeHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	roleMW := appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN", "KOORDINATOR", "FASILITATOR")
	scopeMW := appmiddleware.TenantScope()

	g.GET("", h.List, authMW, roleMW, scopeMW)
}

// RegisterSessionSubstagesRoutes mounts /api/session-substages/* (Live Monitor
// "Selesaikan Kegiatan" override) plus the facilitator-reachable read route
// GET /api/session-substages?session_id=. Every route is JWT + TenantScope guarded.
func RegisterSessionSubstagesRoutes(g *echo.Group, h *SessionSubstageHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	roleMW := appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN", "KOORDINATOR", "FASILITATOR")
	scopeMW := appmiddleware.TenantScope()

	g.POST("/:id/complete", h.Complete, authMW, roleMW, scopeMW)
	g.GET("", h.ListBySession, authMW, roleMW, scopeMW)
}
