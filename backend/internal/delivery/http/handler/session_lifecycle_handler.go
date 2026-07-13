package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
)

// SessionLifecycleHandler serves /api/sessions/:id/{start,complete,cancel}.
type SessionLifecycleHandler struct{ uc *usecase.SessionUsecase }

func NewSessionLifecycleHandler(uc *usecase.SessionUsecase) *SessionLifecycleHandler {
	return &SessionLifecycleHandler{uc: uc}
}

func (h *SessionLifecycleHandler) Start(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	s, err := h.uc.StartSession((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, s)
}

func (h *SessionLifecycleHandler) Complete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	s, err := h.uc.CompleteSession((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, s)
}

func (h *SessionLifecycleHandler) Cancel(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	s, err := h.uc.CancelSession((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, s)
}
