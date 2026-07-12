package handler

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ParticipantMissionHandler serves /api/participant-missions/* (CRUD).
type ParticipantMissionHandler struct {
	repo repository.ParticipantMissionRepository
}

// NewParticipantMissionHandler builds the participant-mission handler.
func NewParticipantMissionHandler(repo repository.ParticipantMissionRepository) *ParticipantMissionHandler {
	return &ParticipantMissionHandler{repo: repo}
}

// Create handles POST /api/participant-missions.
func (h *ParticipantMissionHandler) Create(c *echo.Context) error {
	var req dto.ParticipantMissionRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	m := &entity.ParticipantMission{
		ParticipantID: req.ParticipantID,
		ReportID:      req.ReportID,
		MissionBankID: req.MissionBankID,
		IsCompleted:   req.IsCompleted,
	}
	if m.IsCompleted {
		now := time.Now().Format(time.RFC3339)
		m.CompletedAt = &now
	}
	if err := h.repo.Create((*c).Request().Context(), m); err != nil {
		return err
	}
	return appresp.Created(c, dto.NewParticipantMissionResponse(m))
}

// ListByReport handles GET /api/participant-missions?report_id=.
func (h *ParticipantMissionHandler) ListByReport(c *echo.Context) error {
	reportID := (*c).QueryParam("report_id")
	if reportID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	items, err := h.repo.GetByReport((*c).Request().Context(), reportID)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewParticipantMissionListResponse(items))
}

// GetByID handles GET /api/participant-missions/:id.
func (h *ParticipantMissionHandler) GetByID(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	m, err := h.repo.GetByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewParticipantMissionResponse(m))
}

// Toggle handles POST /api/participant-missions/:id/toggle (completion switch).
func (h *ParticipantMissionHandler) Toggle(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	m, err := h.repo.GetByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	m.IsCompleted = !m.IsCompleted
	if m.IsCompleted {
		now := time.Now().Format(time.RFC3339)
		m.CompletedAt = &now
	} else {
		m.CompletedAt = nil
	}
	if err := h.repo.Update((*c).Request().Context(), m); err != nil {
		return err
	}
	return appresp.OK(c, dto.NewParticipantMissionResponse(m))
}

// Delete handles DELETE /api/participant-missions/:id.
func (h *ParticipantMissionHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.repo.Delete((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ensure imports referenced.
var _ = appmiddleware.GetUserID
var _ = repository.ParticipantMissionFilter{}
