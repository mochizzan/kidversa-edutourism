package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// RegisterSessionsRoutes mounts /api/sessions/* on the given echo group.
// Auth + role guard (FASILITATOR, ADMIN, KOORDINATOR, SUPER_ADMIN); tenant scope via JWT.
func RegisterSessionsRoutes(g *echo.Group, h *SessionHandler, lh *SessionLifecycleHandler,
	sh *SessionStageHandler, gh *SessionGroupHandler,
	ph *SessionParticipantHandler, bh *SessionParticipantBulkHandler, jm *auth.JWTManager) {
	authMW := appmiddleware.JWTAuth(jm, "")
	roleMW := appmiddleware.RequireRole("FASILITATOR", "ADMIN", "KOORDINATOR", "SUPER_ADMIN")

	g.GET("", h.List, authMW, roleMW)
	g.POST("", h.Create, authMW, roleMW)
	g.GET("/:id", h.Get, authMW, roleMW)
	g.PUT("/:id", h.Update, authMW, roleMW)
	g.DELETE("/:id", h.Delete, authMW, roleMW)
	g.POST("/:id/start", lh.Start, authMW, roleMW)
	g.POST("/:id/complete", lh.Complete, authMW, roleMW)
	g.POST("/:id/cancel", lh.Cancel, authMW, roleMW)

	g.GET("/:id/stages", sh.GetStages, authMW, roleMW)
	g.POST("/:id/stages/:stageId/assign", sh.AssignFacilitator, authMW, roleMW)

	g.GET("/:id/groups", gh.ListGroups, authMW, roleMW)
	g.POST("/:id/groups", gh.CreateGroup, authMW, roleMW)
	g.PUT("/:id/groups/:groupId", gh.UpdateGroup, authMW, roleMW)
	g.DELETE("/:id/groups/:groupId", gh.DeleteGroup, authMW, roleMW)

	g.GET("/:id/participants", ph.ListParticipants, authMW, roleMW)
	g.POST("/:id/participants", ph.CreateParticipant, authMW, roleMW)
	g.POST("/:id/participants/link", ph.LinkParticipant, authMW, roleMW)
	g.GET("/:id/participants/:participantId", ph.GetParticipant, authMW, roleMW)
	g.DELETE("/:id/participants/:participantId", ph.DeleteParticipant, authMW, roleMW)
	g.POST("/:id/participants/import", bh.ImportParticipants, authMW, roleMW)
	g.PUT("/:id/participants/:participantId", bh.UpdateParticipant, authMW, roleMW)
}
