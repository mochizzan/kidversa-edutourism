package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterMissionBanksRoutes mounts /api/mission-banks/* on the given echo group.
func RegisterMissionBanksRoutes(g *echo.Group, h *MissionBankHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	g.POST("", h.Create, appmiddleware.JWTAuth(jm, "", revoker))
	g.GET("/:id", h.GetByID, appmiddleware.JWTAuth(jm, "", revoker))
	g.GET("", h.List, appmiddleware.JWTAuth(jm, "", revoker))
	g.PUT("/:id", h.Update, appmiddleware.JWTAuth(jm, "", revoker))
	g.DELETE("/:id", h.Delete, appmiddleware.JWTAuth(jm, "", revoker))
}
