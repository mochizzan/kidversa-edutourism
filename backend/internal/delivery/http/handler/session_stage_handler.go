package handler

import (
	"github.com/labstack/echo/v5"
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
