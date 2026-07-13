package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/live"
)

// RegisterLiveRoutes mounts /api/live/* on the given echo group.
func RegisterLiveRoutes(g *echo.Group, h *LiveHandler, jm *auth.JWTManager, _ *sse.Hub, revoker auth.TokenRevoker) {
	scope := appmiddleware.TenantScope()
	g.GET("/:sessionId/groups", h.Groups, appmiddleware.JWTAuth(jm, "", revoker), scope)
	g.GET("/:sessionId/timeline", h.Timeline, appmiddleware.JWTAuth(jm, "", revoker), scope)
	g.GET("/:sessionId/stream", h.Stream, appmiddleware.JWTAuth(jm, "", revoker), scope)

	// Facilitator overrides (FASILITATOR/ADMIN/SUPER_ADMIN only).
	ov := appmiddleware.JWTAuth(jm, "", revoker)
	roles := appmiddleware.RequireRole(string(entity.RoleFasilitator), string(entity.RoleAdmin), string(entity.RoleSuperAdmin))
	g.POST("/groups/:groupId/stages/:stageId/unlock", h.overrideAction(live.ActionUnlock), ov, roles, scope)
	g.POST("/groups/:groupId/stages/:stageId/complete", h.overrideAction(live.ActionComplete), ov, roles, scope)
	g.POST("/groups/:groupId/stages/:stageId/skip", h.overrideAction(live.ActionSkip), ov, roles, scope)
	g.POST("/groups/:groupId/jump", h.Jump, ov, roles, scope)
	g.POST("/groups/:groupId/reset", h.Reset, ov, roles, scope)
	g.POST("/events", h.PublishEvent, appmiddleware.JWTAuth(jm, "", revoker), scope)
}

// overrideAction adapts the Override method to a fixed action.
func (h *LiveHandler) overrideAction(a live.OverrideAction) echo.HandlerFunc {
	return func(c *echo.Context) error { return h.Override(c, a) }
}
