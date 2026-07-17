package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterConsentRoutes mounts /api/consent/* on the given echo group.
func RegisterConsentRoutes(g *echo.Group, h *ConsentHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	roleMW := appmiddleware.RequireRole("SUPER_ADMIN", "ADMIN", "KOORDINATOR")
	scopeMW := appmiddleware.TenantScope()

	// Send consent via WhatsApp (JWT, tenant-scoped, async batch).
	g.POST("/send-whatsapp", h.SendWhatsApp, authMW, roleMW, scopeMW)
	// SSE stream for batch progress (JWT).
	g.GET("/send-whatsapp/stream", h.SendWhatsAppStream, authMW, roleMW, scopeMW)
	// Public combined consent response by token (no auth — token is the bearer).
	g.POST("/respond-combined", h.RespondCombined)
	// Record a consent decision (JWT, tenant-scoped) — kept for admin manual override.
	g.POST("/respond", h.Respond, authMW, roleMW, scopeMW)
	// Batch consent summary: ?session_ids=comma,separated (JWT, tenant-scoped).
	g.GET("/summary", h.Summary, authMW, roleMW, scopeMW)
	// List consent rows: ?session_id= → by session, otherwise ?participant_id= → by participant (JWT, tenant-scoped).
	g.GET("", h.List, authMW, roleMW, scopeMW)
}
