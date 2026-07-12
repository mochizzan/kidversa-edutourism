package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
)

// SessionHandler serves /api/sessions/* CRUD.
type SessionHandler struct{ uc *usecase.SessionUsecase }

func NewSessionHandler(uc *usecase.SessionUsecase) *SessionHandler { return &SessionHandler{uc: uc} }

func (h *SessionHandler) Create(c *echo.Context) error {
	var req dto.CreateSessionRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	s, err := h.uc.CreateSession((*c).Request().Context(),
		appmiddleware.GetTenantID(c), appmiddleware.GetUserID(c),
		req.ProgramID, req.Name, req.SessionDate, req.Location, req.Notes)
	if err != nil {
		return err
	}
	return appresp.Created(c, s)
}

func (h *SessionHandler) List(c *echo.Context) error {
	f := repository.SessionFilter{
		TenantID:    appmiddleware.GetTenantID(c),
		Search:      (*c).QueryParam("search"),
		Status:      (*c).QueryParam("status"),
		SessionDate: (*c).QueryParam("session_date"),
	}
	page, limit := pagination(c)
	res, err := h.uc.ListSessions((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, res.Items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

func (h *SessionHandler) Get(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	d, err := h.uc.GetSession((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, d)
}

func (h *SessionHandler) Update(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.UpdateSessionRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	s, err := h.uc.UpdateSession((*c).Request().Context(), id,
		req.ProgramID, req.Name, req.SessionDate, req.Location, req.Notes, req.Status)
	if err != nil {
		return err
	}
	return appresp.OK(c, s)
}

func (h *SessionHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.DeleteSession((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
