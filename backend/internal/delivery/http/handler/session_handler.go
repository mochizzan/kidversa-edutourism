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
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	s, err := h.uc.CreateSession((*c).Request().Context(),
		appmiddleware.GetTenantID(c), appmiddleware.GetUserID(c),
		req.ProgramID, req.Name, req.SessionDate,
		derefString(req.StartTime), derefString(req.EndTime),
		req.Location, req.Notes)
	if err != nil {
		return err
	}
	return appresp.Created(c, s)
}

func (h *SessionHandler) List(c *echo.Context) error {
	f := repository.SessionFilter{
		TenantID:      appmiddleware.GetTenantID(c),
		Search:        (*c).QueryParam("search"),
		Status:        (*c).QueryParam("status"),
		SessionDate:   (*c).QueryParam("session_date"),
		FacilitatorID: (*c).QueryParam("facilitator_id"),
	}
	page, limit := pagination(c)
	res, err := h.uc.ListSessions((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	// When facilitator_id is provided, wrap each session in SessionListItem
	// with is_my_session = true (the repo already filtered to only "my" sessions).
	if f.FacilitatorID != "" {
		items := make([]dto.SessionListItem, 0, len(res.Items))
		for _, s := range res.Items {
			items = append(items, dto.SessionListItem{Session: s, IsMySession: true})
		}
		return appresp.OKWithMeta(c, items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
	}
	return appresp.OKWithMeta(c, res.Items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

func (h *SessionHandler) Get(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	d, err := h.uc.GetSession((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, toSessionDetailResponse(d))
}

// toSessionDetailResponse maps the domain SessionDetail (no json tags) to the
// delivery-layer dto with camelCase json tags the frontend expects.
func toSessionDetailResponse(d *repository.SessionDetail) dto.SessionDetail {
	groups := make([]dto.GroupWithParticipants, len(d.Groups))
	for i, g := range d.Groups {
		groups[i] = dto.GroupWithParticipants{
			SessionGroup: g.SessionGroup,
			Participants: g.Participants,
		}
	}
	return dto.SessionDetail{
		Session: d.Session,
		Stages:  d.Stages,
		Groups:  groups,
	}
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
	s, err := h.uc.UpdateSession((*c).Request().Context(), id, appmiddleware.GetTenantID(c),
		req.ProgramID, req.Name, req.SessionDate,
		derefString(req.StartTime), derefString(req.EndTime),
		req.Location, req.Notes, req.Status)
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
	if err := h.uc.DeleteSession((*c).Request().Context(), id, appmiddleware.GetTenantID(c)); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// derefString normalizes a nullable string pointer into an empty-or-value string.
func derefString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
