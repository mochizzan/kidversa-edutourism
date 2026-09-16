package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterAttendanceRoutes mounts /api/attendance/* on the given echo group.
func RegisterAttendanceRoutes(g *echo.Group, h *AttendanceHandler, jm *auth.JWTManager, revoker auth.TokenRevoker) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	scopeMW := appmiddleware.TenantScope()
	roleMW := appmiddleware.RequireRole(entity.RoleSuperAdmin, entity.RoleAdmin, entity.RoleKoordinator, entity.RoleFasilitator)
	g.GET("", h.List, authMW, roleMW, scopeMW)
	g.POST("/upsert", h.Upsert, authMW, roleMW, scopeMW)
	g.POST("/bulk-upsert", h.BulkUpsert, authMW, roleMW, scopeMW)
}
