package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterUsersRoutes mounts /api/users/* on the given echo group.
// SUPER_ADMIN may operate globally; ADMIN is tenant-scoped via TenantScope.
func RegisterUsersRoutes(g *echo.Group, h *UserHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	roleMW := appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN")
	scopeMW := appmiddleware.TenantScope()

	g.GET("", h.List, authMW, roleMW, scopeMW)
	g.POST("", h.Create, authMW, roleMW, scopeMW)
	g.GET("/:id", h.Get, authMW, roleMW, scopeMW)
	g.PUT("/:id", h.Update, authMW, roleMW, scopeMW)
	g.DELETE("/:id", h.Delete, authMW, appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN"), scopeMW)
	g.POST("/:id/approve", h.Approve, authMW, appmiddleware.RequireRole("SUPER_ADMIN"), scopeMW)
	g.POST("/:id/reject", h.Reject, authMW, appmiddleware.RequireRole("SUPER_ADMIN"), scopeMW)
	g.POST("/:id/deactivate", h.Deactivate, authMW, appmiddleware.RequireRole("SUPER_ADMIN"), scopeMW)
}
