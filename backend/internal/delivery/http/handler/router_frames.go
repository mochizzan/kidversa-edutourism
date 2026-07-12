package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterFramesRoutes mounts /api/frames/* on the given echo group.
func RegisterFramesRoutes(g *echo.Group, h *FrameHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	scopeMW := appmiddleware.TenantScope()
	g.POST("", h.Create, authMW, scopeMW)
	g.GET("/:id", h.GetByID, authMW, scopeMW)
	g.GET("", h.List, authMW, scopeMW)
	g.PUT("/:id", h.Update, authMW, scopeMW)
	g.DELETE("/:id", h.Delete, authMW, scopeMW)
	g.POST("/:id/deactivate", h.Deactivate, authMW, scopeMW)
}
