package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterConsentRoutes mounts /api/consent/* on the given echo group.
func RegisterConsentRoutes(g *echo.Group, h *ConsentHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	scopeMW := appmiddleware.TenantScope()

	// Issue a single-use consent token (JWT, tenant-scoped).
	g.POST("/request", h.Request, scopeMW, authMW)
	// Public consent response by token (no auth — token is the bearer).
	g.POST("/respond-public", h.RespondPublic)

	// Record a consent decision (JWT, tenant-scoped).
	g.POST("/respond", h.Respond, scopeMW, authMW)
	// List consent rows: ?session_id= → by session, otherwise ?participant_id= → by participant (JWT, tenant-scoped).
	g.GET("", h.List, scopeMW, authMW)
}
