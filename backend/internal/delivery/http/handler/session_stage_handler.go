package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
)

// SessionStageHandler serves /api/sessions/:id/stages/*.
type SessionStageHandler struct {
	uc *usecase.SessionUsecase
}

// NewSessionStageHandler builds the session-stage sub-handler.
func NewSessionStageHandler(uc *usecase.SessionUsecase) *SessionStageHandler {
	return &SessionStageHandler{uc: uc}
}

// GetStages handles GET /api/sessions/:id/stages.
func (h *SessionStageHandler) GetStages(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	stages, err := h.uc.GetStages((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, stages)
}

// AssignFacilitator handles POST /api/sessions/:id/stages/:stageId/assign.
func (h *SessionStageHandler) AssignFacilitator(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	var req dto.AssignFacilitatorRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	st, err := h.uc.AssignFacilitator((*c).Request().Context(), id, stageID, req.FacilitatorID)
	if err != nil {
		return err
	}
	return appresp.OK(c, st)
}
