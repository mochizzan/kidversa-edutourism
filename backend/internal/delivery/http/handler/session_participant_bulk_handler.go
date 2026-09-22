package handler

import (
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
)

// SessionParticipantBulkHandler serves participant bulk/import + update.
type SessionParticipantBulkHandler struct{ uc *usecase.SessionUsecase }

func NewSessionParticipantBulkHandler(uc *usecase.SessionUsecase) *SessionParticipantBulkHandler {
	return &SessionParticipantBulkHandler{uc: uc}
}

func (h *SessionParticipantBulkHandler) ImportParticipants(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.ImportParticipantsRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	rows := make([]repository.ParticipantInput, 0, len(req.Rows))
	for i := range req.Rows {
		r := req.Rows[i]
		rows = append(rows, repository.ParticipantInput{
			ChildName: r.ChildName, ChildAge: r.ChildAge, SchoolName: r.SchoolName,
			ParentName: r.ParentName, ParentPhone: r.ParentPhone, ParentEmail: r.ParentEmail,
			ConsentPhoto: r.ConsentPhoto,
		})
	}
	out, err := h.uc.ImportParticipants((*c).Request().Context(), appmiddleware.GetTenantID(c), id, rows)
	if err != nil {
		return err
	}
	return appresp.Created(c, out)
}

func (h *SessionParticipantBulkHandler) UpdateParticipant(c *echo.Context) error {
	pid, ok := bindUUID(c, "participantId")
	if !ok {
		return nil
	}
	var req dto.UpdateParticipantRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	p, err := h.uc.UpdateParticipant((*c).Request().Context(), pid,
		req.ChildName, req.ChildAge, req.SchoolName, req.ParentName, req.ParentPhone,
		req.ParentEmail, req.GroupID, req.ConsentPhoto, req.ChildAge != 0)
	if err != nil {
		return err
	}
	return appresp.OK(c, p)
}
