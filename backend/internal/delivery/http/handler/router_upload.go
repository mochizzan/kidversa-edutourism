package handler

import (
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"

	"kidversa-edutourism-backend/internal/config"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// uploadMaxBodyBytes returns the multipart upload cap derived from the configured
// UPLOAD_MAX_MB (default 25 MB).
func uploadMaxBodyBytes(cfg *config.Config) int64 {
	mb := cfg.UploadMaxMB
	if mb <= 0 {
		mb = 25
	}
	return int64(mb) << 20
}

// RegisterUploadRoutes mounts the file-upload endpoints:
//   - POST /api/photos/upload
//   - POST /api/recordings/upload
//
// Both require a valid JWT and tenant scope, and enforce an echo BodyLimit of
// the configured max upload size on the raw request.
func RegisterUploadRoutes(g *echo.Group, h *UploadHandler, jm *auth.JWTManager, cfg *config.Config, revoker auth.TokenRevoker) {
	sseCookie := cfg.SSECookieName()
	limit := uploadMaxBodyBytes(cfg)
	g.POST("/photos/upload", h.UploadPhoto,
		appmiddleware.JWTAuth(jm, sseCookie, revoker),
		appmiddleware.TenantScope(),
		middleware.BodyLimit(limit),
	)
	g.POST("/recordings/upload", h.UploadRecording,
		appmiddleware.JWTAuth(jm, sseCookie, revoker),
		appmiddleware.TenantScope(),
		middleware.BodyLimit(limit),
	)
}
