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
	ph *SessionParticipantHandler, bh *SessionParticipantBulkHandler, jm *auth.JWTManager, revoker auth.TokenRevoker, kioskH *KioskHandler,
	participantsGroup *echo.Group) {
	authMW := appmiddleware.JWTAuth(jm, "", revoker)
	roleMW := appmiddleware.RequireRole("FASILITATOR", "ADMIN", "KOORDINATOR", "SUPER_ADMIN")

	g.GET("", h.List, authMW, roleMW, appmiddleware.TenantScope())
	g.GET("/participants", ph.ListParticipantsGlobal, authMW, roleMW, appmiddleware.TenantScope())
	g.POST("", h.Create, authMW, roleMW, appmiddleware.TenantScope())
	g.GET("/:id", h.Get, authMW, roleMW, appmiddleware.TenantScope())
	g.GET("/:id/kiosk", kioskH.KioskAccess)
	g.PUT("/:id", h.Update, authMW, roleMW, appmiddleware.TenantScope())
	g.DELETE("/:id", h.Delete, authMW, roleMW, appmiddleware.TenantScope())
	g.POST("/:id/start", lh.Start, authMW, roleMW, appmiddleware.TenantScope())
	g.POST("/:id/complete", lh.Complete, authMW, roleMW, appmiddleware.TenantScope())
	g.POST("/:id/cancel", lh.Cancel, authMW, roleMW, appmiddleware.TenantScope())

	g.GET("/:id/stages", sh.GetStages, authMW, roleMW, appmiddleware.TenantScope())
	g.POST("/:id/stages/:stageId/assign", sh.AssignFacilitator, authMW, roleMW, appmiddleware.TenantScope())

	g.GET("/:id/groups", gh.ListGroups, authMW, roleMW, appmiddleware.TenantScope())
	g.POST("/:id/groups", gh.CreateGroup, authMW, roleMW, appmiddleware.TenantScope())
	g.PUT("/:id/groups/:groupId", gh.UpdateGroup, authMW, roleMW, appmiddleware.TenantScope())
	g.DELETE("/:id/groups/:groupId", gh.DeleteGroup, authMW, roleMW, appmiddleware.TenantScope())

	g.GET("/:id/participants", ph.ListParticipants, authMW, roleMW, appmiddleware.TenantScope())
	g.POST("/:id/participants", ph.CreateParticipant, authMW, roleMW, appmiddleware.TenantScope())
	g.POST("/:id/participants/link", ph.LinkParticipant, authMW, roleMW, appmiddleware.TenantScope())
	g.GET("/:id/participants/linkable", ph.ListLinkableParticipants, authMW, roleMW, appmiddleware.TenantScope())
	g.GET("/:id/participants/:participantId", ph.GetParticipant, authMW, roleMW, appmiddleware.TenantScope())
	g.DELETE("/:id/participants/:participantId", ph.DeleteParticipant, authMW, roleMW, appmiddleware.TenantScope())
	g.POST("/:id/participants/import", bh.ImportParticipants, authMW, roleMW, appmiddleware.TenantScope())
	g.PUT("/:id/participants/:participantId", bh.UpdateParticipant, authMW, roleMW, appmiddleware.TenantScope())

	// Global participants group (/api/participants) — tenant-scoped list + single-get + create.
	participantsGroup.POST("", ph.CreateParticipantGlobal, authMW, roleMW, appmiddleware.TenantScope())
	participantsGroup.GET("", ph.ListParticipantsGlobal, authMW, roleMW, appmiddleware.TenantScope())
	participantsGroup.GET("/:id", ph.GetParticipantGlobal, authMW, roleMW, appmiddleware.TenantScope())
}
