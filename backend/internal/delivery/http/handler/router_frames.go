package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterFramesRoutes mounts /api/frames/* on the given echo group.
func RegisterFramesRoutes(g *echo.Group, h *FrameHandler, jm *auth.JWTManager) {
	g.POST("", h.Create, appmiddleware.JWTAuth(jm, ""))
	g.GET("/:id", h.GetByID, appmiddleware.JWTAuth(jm, ""))
	g.GET("", h.List, appmiddleware.JWTAuth(jm, ""))
	g.PUT("/:id", h.Update, appmiddleware.JWTAuth(jm, ""))
	g.DELETE("/:id", h.Delete, appmiddleware.JWTAuth(jm, ""))
}
