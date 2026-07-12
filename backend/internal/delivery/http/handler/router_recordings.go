package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterRecordingsRoutes mounts /api/recordings/* on the given echo group.
// File uploads happen at /api/recordings/upload (RegisterUploadRoutes).
func RegisterRecordingsRoutes(g *echo.Group, h *RecordingHandler, jm *auth.JWTManager) {
	g.GET("/:id", h.GetByID, appmiddleware.JWTAuth(jm, ""))
	g.GET("", h.List, appmiddleware.JWTAuth(jm, ""))
	g.POST("/:id/review", h.Review, appmiddleware.JWTAuth(jm, ""))
	g.DELETE("/:id", h.Delete, appmiddleware.JWTAuth(jm, ""))
}
