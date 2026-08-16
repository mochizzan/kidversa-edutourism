package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterTenantsRoutes mounts /api/tenants/* on the given echo group.
// All tenant operations require SUPER_ADMIN.
func RegisterTenantsRoutes(g *echo.Group, h *TenantHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	roleMW := appmiddleware.RequireRole("SUPER_ADMIN")

	g.GET("", h.List, authMW, roleMW)
	g.POST("", h.Create, authMW, roleMW)
	g.GET("/stats", h.Stats, authMW, roleMW)
	g.GET("/:id", h.Get, authMW, roleMW)
	g.PUT("/:id", h.Update, authMW, roleMW)
	g.DELETE("/:id", h.Delete, authMW, roleMW)
}

// RegisterPublicRoutes mounts the anonymous tenant endpoints under /api/public/tenants.
// These are intentionally unauthenticated (no JWTAuth/RequireRole) so the public
// registration form can list tenants. Only a minimal projection (id/name/slug) is
// returned by the handler; no tenant configuration is exposed.
func RegisterPublicRoutes(g *echo.Group, h *TenantHandler) {
	g.GET("/tenants", h.PublicList)
}
