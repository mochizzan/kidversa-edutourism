package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
)

// SessionGroupHandler serves /api/sessions/:id/groups/*.
type SessionGroupHandler struct {
	uc *usecase.SessionUsecase
}

// NewSessionGroupHandler builds the session-group sub-handler.
func NewSessionGroupHandler(uc *usecase.SessionUsecase) *SessionGroupHandler {
	return &SessionGroupHandler{uc: uc}
}

// ListGroups handles GET /api/sessions/:id/groups.
func (h *SessionGroupHandler) ListGroups(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	gs, err := h.uc.GetGroups((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, gs)
}

// CreateGroup handles POST /api/sessions/:id/groups.
func (h *SessionGroupHandler) CreateGroup(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.CreateGroupRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	g, err := h.uc.CreateGroup((*c).Request().Context(), id, req.Name)
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
	g, err := h.uc.UpdateGroup((*c).Request().Context(), groupID, req.Name, req.Status)
	if err != nil {
		return err
	}
	return appresp.OK(c, g)
}

// DeleteGroup handles DELETE /api/sessions/:id/groups/:groupId.
func (h *SessionGroupHandler) DeleteGroup(c *echo.Context) error {
	groupID, ok := bindUUID(c, "groupId")
	if !ok {
		return nil
	}
	if err := h.uc.DeleteGroup((*c).Request().Context(), groupID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
