package handler

import (
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterMediaRoutes mounts the authenticated media-serving endpoint:
//   - GET /api/media/:kind/:id   (kind = photo | recording)
//
// Auth + tenant scope are enforced via middleware; per-asset consent and
// on-disk security checks live in the handler.
func RegisterMediaRoutes(g *echo.Group, h *MediaHandler, jm *auth.JWTManager, cfg *config.Config, revoker auth.TokenRevoker) {
	sseCookie := cfg.SSECookieName()
	g.GET("/media/:kind/:id", h.Get,
		appmiddleware.JWTAuth(jm, sseCookie, revoker),
		appmiddleware.TenantScope(),
	)
}
