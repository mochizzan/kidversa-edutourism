package handler

import (
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
	ps, err := h.uc.GetParticipants((*c).Request().Context(), id, (*c).QueryParam("group_id"), appmiddleware.GetTenantID(c))
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
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	p, err := h.uc.CreateParticipant((*c).Request().Context(),
		appmiddleware.GetTenantID(c), id, req.GroupID, req.ChildName, req.ChildAge,
		req.SchoolName, req.ParentName, req.ParentPhone, req.ParentEmail, req.ConsentRecording, req.ConsentPhoto)
	if err != nil {
		return err
	}
	return appresp.Created(c, p)
}

// CreateParticipantGlobal handles the global POST /api/participants (tenant-scoped
// via TenantScope middleware; SUPER_ADMIN may pass X-Tenant-Id to scope to a tenant).
// Creates a standalone participant not yet attached to a session.
func (h *SessionParticipantHandler) CreateParticipantGlobal(c *echo.Context) error {
	var req dto.CreateParticipantRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	p, err := h.uc.CreateParticipant((*c).Request().Context(),
		appmiddleware.GetTenantID(c), "", req.GroupID, req.ChildName, req.ChildAge,
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
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	result, err := h.uc.LinkParticipant((*c).Request().Context(), id, req.ParticipantID, req.GroupID, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.LinkParticipantResponse{
		Participant:         result.Participant,
		PreviousSessionID:   result.PreviousSessionID,
		PreviousSessionName: result.PreviousSessionName,
		PreviousProgramID:   result.PreviousProgramID,
	})
}

// GetParticipantGlobal handles the global GET /api/participants/:id (tenant-scoped
// via TenantScope middleware; SUPER_ADMIN may pass X-Tenant-Id to scope to a tenant).
func (h *SessionParticipantHandler) GetParticipantGlobal(c *echo.Context) error {
	tenantID := appmiddleware.GetTenantID(c)
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	p, err := h.uc.GetParticipantGlobal((*c).Request().Context(), id, tenantID)
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
	p, err := h.uc.GetParticipant((*c).Request().Context(), pid, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, p)
}

// ListParticipantsGlobal handles the global GET /api/participants (tenant-scoped via
// TenantScope middleware; SUPER_ADMIN may pass X-Tenant-Id to scope to a tenant).
// Query params: session_id, group_id, page, limit, search.
func (h *SessionParticipantHandler) ListParticipantsGlobal(c *echo.Context) error {
	tenantID := appmiddleware.GetTenantID(c)
	sessionID := (*c).QueryParam("session_id")
	groupID := (*c).QueryParam("group_id")
	search := (*c).QueryParam("search")
	page, limit := pagination(c)
	res, err := h.uc.ListParticipantsGlobal((*c).Request().Context(), tenantID, sessionID, groupID, search, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, res.Items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

func (h *SessionParticipantHandler) DeleteParticipant(c *echo.Context) error {
	pid, ok := bindUUID(c, "participantId")
	if !ok {
		return nil
	}
	if err := h.uc.DeleteParticipant((*c).Request().Context(), pid, appmiddleware.GetTenantID(c)); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ListLinkableParticipants returns participants linked to sessions of the same
// program as the target session, enriched with session context. Used by the
// "Tambah Peserta" modal to show migration badges.
func (h *SessionParticipantHandler) ListLinkableParticipants(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	ctx := (*c).Request().Context()

	// Resolve the program_id from the target session.
	session, err := h.uc.GetSession(ctx, id, tenantID)
	if err != nil {
		return err
	}
	programID := session.Session.ProgramID

	ps, err := h.uc.GetParticipantsForProgram(ctx, programID, tenantID)
	if err != nil {
		return err
	}
	return appresp.OK(c, ps)
}
