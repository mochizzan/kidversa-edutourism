package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterGalleryRoutes mounts /api/reports/gallery + token management routes.
//   - GET  /api/reports/gallery?token=...        PUBLIC (gallery access via QR)
//   - POST /api/reports/:id/gallery-token         JWT (generate token for approved report)
//   - POST /api/reports/:id/revoke-gallery-token  JWT (revoke gallery token)
func RegisterGalleryRoutes(g *echo.Group, h *GalleryHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	scopeMW := appmiddleware.TenantScope()

	// Public gallery access — intentionally outside JWTAuth (gallery token is the authn).
	g.GET("/gallery", h.GetByToken, appmiddleware.RateLimit(30))
	// Authenticated token management.
	g.POST("/:id/gallery-token", h.GenerateToken, authMW, scopeMW)
	g.POST("/:id/revoke-gallery-token", h.RevokeToken, authMW, scopeMW)
}
