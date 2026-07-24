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
	g.GET("/:kind/:id", h.Get,
		appmiddleware.JWTAuth(jm, sseCookie, revoker),
		appmiddleware.TenantScope(),
	)
}

// RegisterKioskMediaRoutes mounts a PUBLIC content-serving endpoint for the
// learner kiosk — no JWT or session cookie required. Only stage content files
// are served; photos/recordings/frames/avatars remain authenticated.
func RegisterKioskMediaRoutes(g *echo.Group, h *MediaHandler) {
	g.GET("/content/:id", h.GetContent)
}
