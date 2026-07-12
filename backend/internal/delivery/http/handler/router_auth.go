package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterAuthRoutes mounts /api/auth/* on the given echo group.
// sseCookieName enables the SSE session cookie set at login (read by SSE middleware).
func RegisterAuthRoutes(g *echo.Group, h *AuthHandler, jm *auth.JWTManager, sseCookieName string, revoker auth.TokenRevoker) {
	g.POST("/login", h.Login)
	g.POST("/register", h.Register)
	g.POST("/refresh", h.Refresh)
	g.GET("/me", h.Me, appmiddleware.JWTAuth(jm, sseCookieName, revoker))
	g.POST("/logout", h.Logout, appmiddleware.JWTAuth(jm, sseCookieName, revoker))
	g.POST("/change-password", h.ChangePassword, appmiddleware.JWTAuth(jm, sseCookieName, revoker))
	g.POST("/kiosk", h.IssueKiosk, appmiddleware.JWTAuth(jm, sseCookieName, revoker))
}
