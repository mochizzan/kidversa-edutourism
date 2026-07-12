package handler

import (
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"

	"kidversa-edutourism-backend/internal/config"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// uploadMaxBodyBytes caps multipart uploads (25 MB) per the contract.
const uploadMaxBodyBytes int64 = 25 << 20

// RegisterUploadRoutes mounts the file-upload endpoints:
//   - POST /api/photos/upload
//   - POST /api/recordings/upload
//
// Both require a valid JWT and tenant scope, and enforce an echo BodyLimit of
// 25 MB on the raw request.
func RegisterUploadRoutes(g *echo.Group, h *UploadHandler, jm *auth.JWTManager, cfg *config.Config, revoker auth.TokenRevoker) {
	sseCookie := cfg.SSECookieName()
	g.POST("/photos/upload", h.UploadPhoto,
		appmiddleware.JWTAuth(jm, sseCookie, revoker),
		appmiddleware.TenantScope(),
		middleware.BodyLimit(uploadMaxBodyBytes),
	)
	g.POST("/recordings/upload", h.UploadRecording,
		appmiddleware.JWTAuth(jm, sseCookie, revoker),
		appmiddleware.TenantScope(),
		middleware.BodyLimit(uploadMaxBodyBytes),
	)
}
