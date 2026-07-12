package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterPhotosRoutes mounts /api/photos/* on the given echo group.
// Actual file uploads happen at /api/photos/upload (RegisterUploadRoutes).
// This group covers read/list/delete of SmartPhoto records.
func RegisterPhotosRoutes(g *echo.Group, h *PhotoHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	scopeMW := appmiddleware.TenantScope()
	g.GET("/:id", h.GetByID, authMW, scopeMW)
	g.GET("", h.List, authMW, scopeMW)
	g.PUT("/:id", h.Update, authMW, scopeMW)
	g.POST("/:id/set-report-photo", h.SetReportPhoto, authMW, scopeMW)
	g.DELETE("/:id", h.Delete, authMW, scopeMW)
}
