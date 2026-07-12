package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterReportsRoutes mounts /api/reports/* on the given echo group.
//   - GET  /api/reports/access?token=...   PUBLIC (anti-IDOR parent access)
//   - POST /api/reports/:id/generate        (async narrative placeholder)
//   - POST /api/reports/:id/approve
//   - POST /api/reports/:id/send            (generates parent token)
//   - POST /api/reports/:id/revoke-token
//   - GET  /api/reports/:id/narrative-stream (SSE)
//
// The public access endpoint is intentionally OUTSIDE JWTAuth; the token itself
// is the authorization mechanism.
func RegisterReportsRoutes(g *echo.Group, h *ReportHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	scopeMW := appmiddleware.TenantScope()
	// Public token access — intentionally outside JWTAuth (token is the authn).
	g.GET("/access", h.GetByAccessToken)
	g.GET("", h.ListReports, authMW, scopeMW)
	g.GET("/:id", h.GetReport, authMW, scopeMW)
	g.POST("/:id/generate", h.Generate, authMW, scopeMW)
	g.POST("/:id/approve", h.Approve, authMW, scopeMW)
	g.POST("/:id/send", h.Send, authMW, scopeMW)
	g.POST("/:id/revoke-token", h.RevokeToken, authMW, scopeMW)
	g.GET("/:id/narrative-stream", h.NarrativeStream, authMW, scopeMW)
}
