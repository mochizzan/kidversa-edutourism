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
//   - POST /api/frames/upload
//   - POST /api/program-stages/:stageId/contents/upload
//   - POST /api/users/:id/avatar
//
// All require a valid JWT and tenant scope, and enforce an echo BodyLimit of
// the configured max upload size on the raw request. The frame/content/avatar
// routes reuse the same middleware chain as the photo/recording uploads.
func RegisterUploadRoutes(g *echo.Group, h *UploadHandler, jm *auth.JWTManager, cfg *config.Config, revoker auth.TokenRevoker) {
	sseCookie := cfg.SSECookieName()
	limit := uploadMaxBodyBytes(cfg)
	authMW := appmiddleware.JWTAuth(jm, sseCookie, revoker)
	scopeMW := appmiddleware.TenantScope()
	bodyMW := middleware.BodyLimit(limit)

	g.POST("/photos/upload", h.UploadPhoto, authMW, scopeMW, bodyMW)
	g.POST("/recordings/upload", h.UploadRecording, authMW, scopeMW, bodyMW)
	g.POST("/frames/upload", h.UploadFrame, authMW, scopeMW, bodyMW)
	g.POST("/users/:id/avatar", h.UploadAvatar, authMW, scopeMW, bodyMW)
}
