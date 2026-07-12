package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterRecordingsRoutes mounts /api/recordings/* on the given echo group.
// File uploads happen at /api/recordings/upload (RegisterUploadRoutes).
func RegisterRecordingsRoutes(g *echo.Group, h *RecordingHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	scopeMW := appmiddleware.TenantScope()
	g.GET("/:id", h.GetByID, authMW, scopeMW)
	g.GET("", h.List, authMW, scopeMW)
	g.POST("/:id/review", h.Review, authMW, scopeMW)
	g.PUT("/:id", h.Update, authMW, scopeMW)
	g.DELETE("/:id", h.Delete, authMW, scopeMW)
}
