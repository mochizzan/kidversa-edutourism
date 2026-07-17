package handler

import (
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/live"
)

// RegisterLiveRoutes mounts /api/live/* on the given echo group.
// The SSE /stream route uses cookie auth (cfg.SSECookieName) so the browser's
// EventSource (which cannot send an Authorization header) can authenticate via
// the kidversa_session cookie. Other routes keep bearer auth (called via fetch).
func RegisterLiveRoutes(g *echo.Group, h *LiveHandler, jm *auth.JWTManager, _ *sse.Hub, cfg *config.Config, revoker auth.TokenRevoker) {
	scope := appmiddleware.TenantScope()
	bearer := appmiddleware.JWTAuth(jm, "", revoker)
	streamAuth := appmiddleware.JWTAuth(jm, cfg.SSECookieName(), revoker)
	g.GET("/:sessionId/groups", h.Groups, bearer, scope)
	g.GET("/:sessionId/timeline", h.Timeline, bearer, scope)
	g.GET("/:sessionId/stream", h.Stream, streamAuth, scope)

	// Facilitator overrides (FASILITATOR/ADMIN/SUPER_ADMIN only).
	ov := bearer
	roles := appmiddleware.RequireRole(string(entity.RoleFasilitator), string(entity.RoleAdmin), string(entity.RoleSuperAdmin))
	g.POST("/groups/:groupId/stages/:stageId/unlock", h.overrideAction(live.ActionUnlock), ov, roles, scope)
	g.POST("/groups/:groupId/stages/:stageId/complete", h.overrideAction(live.ActionComplete), ov, roles, scope)
	g.POST("/groups/:groupId/stages/:stageId/skip", h.overrideAction(live.ActionSkip), ov, roles, scope)
	g.POST("/groups/:groupId/jump", h.Jump, ov, roles, scope)
	g.POST("/groups/:groupId/reset", h.Reset, ov, roles, scope)
	g.POST("/events", h.PublishEvent, bearer, scope)
}

// overrideAction adapts the Override method to a fixed action.
func (h *LiveHandler) overrideAction(a live.OverrideAction) echo.HandlerFunc {
	return func(c *echo.Context) error { return h.Override(c, a) }
}
