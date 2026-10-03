package handler

import (
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterReportsRoutes mounts /api/reports/* on the given echo group.
//   - GET  /api/reports/access?token=...   PUBLIC (anti-IDOR parent access)
//   - GET  /api/reports/access/badge/:contentId?token=...  PUBLIC (badge image
//     bytes for the parent mini-raport <img>; token authn + badge membership)
//   - POST /api/reports/:id/generate/stream  (async AI narrative, 202 + SSE)
//   - GET  /api/reports/:id/generate/stream  (SSE token stream)
//   - POST /api/reports/:id/approve
//   - POST /api/reports/:id/send            (mints parent token + delivers the
//     link to the parent's WhatsApp; SENT only after the gateway confirms)
//   - GET  /api/reports/:id/message         (exact WhatsApp text Send delivers,
//     shared builder; no token mint, no send, no status change)
//
// The public access endpoint is intentionally OUTSIDE JWTAuth; the token itself
// is the authorization mechanism.
func RegisterReportsRoutes(g *echo.Group, h *ReportHandler, jm *auth.JWTManager, cfg *config.Config, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	streamAuth := appmiddleware.JWTAuth(jm, cfg.SSECookieName(), revoker)
	scopeMW := appmiddleware.TenantScope()
	// Public token access — intentionally outside JWTAuth (token is the authn).
	// RateLimit(cfg.RateLimitPerMin) brute-force protection on the 64hex token space.
	g.GET("/access", h.GetByAccessToken, appmiddleware.RateLimit(cfg.RateLimitPerMin))
	// Token-validated photo bytes for the parent mini-raport <img>.
	g.GET("/access/photo", h.GetAccessPhoto, appmiddleware.RateLimit(cfg.RateLimitPerMin))
	// Token-validated badge image bytes for the parent mini-raport <img>.
	g.GET("/access/badge/:contentId", h.GetAccessBadge, appmiddleware.RateLimit(cfg.RateLimitPerMin))
	// Session-level generate: static route must precede /:id routes.
	g.POST("/generate", h.GenerateForSession, authMW, scopeMW)
	g.GET("", h.ListReports, authMW, scopeMW)
	// Streaming AI narrative: POST triggers async generation (202), GET streams tokens via SSE.
	g.POST("/:id/generate/stream", h.GenerateStream, authMW, scopeMW)
	g.GET("/:id/generate/stream", h.GenerateStreamSSE, streamAuth, scopeMW)
	g.POST("/:id/approve", h.Approve, authMW, scopeMW)
	g.POST("/:id/suggest-missions", h.SuggestMissions, authMW, scopeMW)
	g.POST("/:id/missions", h.SaveMissions, authMW, scopeMW)
	// On-demand gallery token for the admin preview QR footer (mint-if-missing).
	g.POST("/:id/gallery-token", h.EnsureGalleryToken, authMW, scopeMW)
	g.POST("/:id/send", h.Send, authMW, scopeMW)
	// Admin message preview: the exact text /send delivers (shared builder).
	g.GET("/:id/message", h.MessagePreview, authMW, scopeMW)
	// TODO: DELETE /api/reports/:id is not yet exposed. If added, it MUST use a
	// HARD delete (db.Unscoped().Delete) — the soft-delete in GormReportRepository.Delete
	// leaves the (session_id, participant_id) row in uq_reports_session_participant and
	// would make a later GenerateForSession hit ER_DUP_ENTRY (409). See Task 7 invariant.
}
