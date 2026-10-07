package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
	badgeuc "kidversa-edutourism-backend/internal/usecase/badge"
)

// SessionGroupHandler serves /api/sessions/:id/groups/*.
type SessionGroupHandler struct {
	uc      *usecase.SessionUsecase
	badgeUC *badgeuc.Usecase
}

// NewSessionGroupHandler builds the session-group sub-handler.
func NewSessionGroupHandler(uc *usecase.SessionUsecase, badgeUC *badgeuc.Usecase) *SessionGroupHandler {
	return &SessionGroupHandler{uc: uc, badgeUC: badgeUC}
}

// sessionGroupItem is a session group annotated with the caller-scoped
// ownership flag (additive — existing group fields are unchanged).
type sessionGroupItem struct {
	entity.SessionGroup
	IsOwner bool `json:"is_owner"`
}

// ListGroups handles GET /api/sessions/:id/groups.
// The owning session is verified against the caller's tenant first (§5.A) so
// groups (incl. facilitator_id) never leak across tenants. Every group is
// returned regardless of owner; is_owner tells a FASILITATOR which group(s)
// they may enter (elevated roles see everything — JWT claims from authMW).
func (h *SessionGroupHandler) ListGroups(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	gs, err := h.uc.GetGroups((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	role, actorID := appmiddleware.GetRole(c), appmiddleware.GetUserID(c)
	items := make([]sessionGroupItem, len(gs))
	for i, g := range gs {
		items[i] = sessionGroupItem{SessionGroup: g, IsOwner: isGroupOwner(role, actorID, g.FacilitatorID)}
	}
	return appresp.OK(c, items)
}

// CreateGroup handles POST /api/sessions/:id/groups.
func (h *SessionGroupHandler) CreateGroup(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.CreateGroupRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	// bindAndValidate writes the 400 envelope itself but returns nil when it
	// rejects the body — Committed is the only failure signal, and without
	// this check an invalid body would still reach CreateGroup.
	if resp, okResp := (*c).Response().(*echo.Response); okResp && resp.Committed {
		return nil
	}
	g, err := h.uc.CreateGroup((*c).Request().Context(), id, appmiddleware.GetTenantID(c), req.Name)
	if err != nil {
		return err
	}
	return appresp.Created(c, g)
}

// UpdateGroup handles PUT /api/sessions/:id/groups/:groupId.
func (h *SessionGroupHandler) UpdateGroup(c *echo.Context) error {
	groupID, ok := bindUUID(c, "groupId")
	if !ok {
		return nil
	}
	var req dto.UpdateGroupRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	tenantID := appmiddleware.GetTenantID(c)

	// Load first: existence + tenant check AND the facilitator-ownership gate
	// (§5.B) run BEFORE any write — previously any facilitator could rename or
	// reassign any group in the tenant.
	g, err := h.uc.GetGroupByID((*c).Request().Context(), groupID, tenantID)
	if err != nil {
		return err
	}
	if err := assertFacilitatorOwnership(appmiddleware.GetRole(c), appmiddleware.GetUserID(c), g.FacilitatorID); err != nil {
		return err
	}

	// When setting status to COMPLETED, validate all progress rows first.
	if req.Status == "COMPLETED" {
		sessionID, ok := bindUUID(c, "id")
		if !ok {
			return nil
		}
		if err := h.badgeUC.CheckAndCompleteGroup((*c).Request().Context(), sessionID, groupID, tenantID); err != nil {
			return err
		}
	}

	g, err = h.uc.UpdateGroup((*c).Request().Context(), groupID, req.Name, req.Status, tenantID, req.FacilitatorID)
	if err != nil {
		return err
	}
	return appresp.OK(c, g)
}

// DeleteGroup handles DELETE /api/sessions/:id/groups/:groupId. The path
// session :id must own the group: the tenant-scoped load runs first and a
// group from another session surfaces as 404 before any delete (defense in
// depth with the usecase load — both layers reject, the repo delete never runs
// for a foreign group).
func (h *SessionGroupHandler) DeleteGroup(c *echo.Context) error {
	sessionID, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	groupID, ok := bindUUID(c, "groupId")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	tenantID := appmiddleware.GetTenantID(c)
	g, err := h.uc.GetGroupByID(ctx, groupID, tenantID)
	if err != nil {
		return err
	}
	if g.SessionID != sessionID {
		return apperrors.NotFound("not_found", nil)
	}
	if err := h.uc.DeleteGroup(ctx, groupID, tenantID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
