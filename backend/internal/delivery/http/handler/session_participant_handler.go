package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
)

// SessionParticipantHandler serves /api/sessions/:id/participants/* (basic ops).
type SessionParticipantHandler struct{ uc *usecase.SessionUsecase }

func NewSessionParticipantHandler(uc *usecase.SessionUsecase) *SessionParticipantHandler {
	return &SessionParticipantHandler{uc: uc}
}

func (h *SessionParticipantHandler) ListParticipants(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ps, err := h.uc.GetParticipants((*c).Request().Context(), id, (*c).QueryParam("group_id"))
	if err != nil {
		return err
	}
	return appresp.OK(c, ps)
}

func (h *SessionParticipantHandler) CreateParticipant(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.CreateParticipantRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	p, err := h.uc.CreateParticipant((*c).Request().Context(),
		appmiddleware.GetTenantID(c), id, req.GroupID, req.ChildName, req.ChildAge,
		req.SchoolName, req.ParentName, req.ParentPhone, req.ParentEmail, req.ConsentRecording, req.ConsentPhoto)
	if err != nil {
		return err
	}
	return appresp.Created(c, p)
}

func (h *SessionParticipantHandler) LinkParticipant(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.LinkParticipantRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	p, err := h.uc.LinkParticipant((*c).Request().Context(), id, req.ParticipantID, req.GroupID)
	if err != nil {
		return err
	}
	return appresp.OK(c, p)
}

func (h *SessionParticipantHandler) GetParticipant(c *echo.Context) error {
	pid, ok := bindUUID(c, "participantId")
	if !ok {
		return nil
	}
	p, err := h.uc.GetParticipant((*c).Request().Context(), pid)
	if err != nil {
		return err
	}
	return appresp.OK(c, p)
}

func (h *SessionParticipantHandler) DeleteParticipant(c *echo.Context) error {
	pid, ok := bindUUID(c, "participantId")
	if !ok {
		return nil
	}
	if err := h.uc.DeleteParticipant((*c).Request().Context(), pid); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
