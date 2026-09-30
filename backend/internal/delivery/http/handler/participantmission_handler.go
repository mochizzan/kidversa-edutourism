package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
)

// ParticipantMissionHandler serves /api/participant-missions/* (CRUD).
type ParticipantMissionHandler struct {
	repo repository.ParticipantMissionRepository
}

// NewParticipantMissionHandler builds the participant-mission handler.
func NewParticipantMissionHandler(repo repository.ParticipantMissionRepository) *ParticipantMissionHandler {
	return &ParticipantMissionHandler{repo: repo}
}

// List handles GET /api/participant-missions (GET ""). Dispatches on the
// query param: ?report_id= → missions for a report.
func (h *ParticipantMissionHandler) List(c *echo.Context) error {
	if reportID := (*c).QueryParam("report_id"); reportID != "" {
		return h.ListByReport(c)
	}
	return appresp.Fail(c, http.StatusBadRequest, "bad_request")
}

// ListByReport handles GET /api/participant-missions?report_id=.
func (h *ParticipantMissionHandler) ListByReport(c *echo.Context) error {
	reportID := (*c).QueryParam("report_id")
	if reportID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	items, err := h.repo.GetByReport((*c).Request().Context(), tenantID, reportID)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewParticipantMissionListResponse(items))
}

// Toggle handles POST /api/participant-missions/:id/toggle (completion switch).
func (h *ParticipantMissionHandler) Toggle(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	m, err := h.repo.GetByID((*c).Request().Context(), tenantID, id)
	if err != nil {
		return err
	}
	m.IsCompleted = !m.IsCompleted
	if m.IsCompleted {
		now := apputil.Now()
		m.CompletedAt = &now
	} else {
		m.CompletedAt = nil
	}
	if err := h.repo.Update((*c).Request().Context(), tenantID, m); err != nil {
		return err
	}
	return appresp.OK(c, dto.NewParticipantMissionResponse(m))
}
