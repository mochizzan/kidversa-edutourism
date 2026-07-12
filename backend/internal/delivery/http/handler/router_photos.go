package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterPhotosRoutes mounts /api/photos/* on the given echo group.
// Actual file uploads happen at /api/photos/upload (RegisterUploadRoutes).
// This group covers read/list/delete of SmartPhoto records.
func RegisterPhotosRoutes(g *echo.Group, h *PhotoHandler, jm *auth.JWTManager) {
	g.GET("/:id", h.GetByID, appmiddleware.JWTAuth(jm, ""))
	g.GET("", h.List, appmiddleware.JWTAuth(jm, ""))
	g.DELETE("/:id", h.Delete, appmiddleware.JWTAuth(jm, ""))
}
