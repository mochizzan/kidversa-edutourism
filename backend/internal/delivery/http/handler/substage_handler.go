package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	badgeuc "kidversa-edutourism-backend/internal/usecase/badge"
)

// ProgramSubstageHandler serves /api/program-substages/* (CRUD over Kegiatan).
type ProgramSubstageHandler struct {
	repo repository.ProgramSubstageRepository
}

// NewProgramSubstageHandler builds the program-substage handler.
func NewProgramSubstageHandler(repo repository.ProgramSubstageRepository) *ProgramSubstageHandler {
	return &ProgramSubstageHandler{repo: repo}
}

// SubstageRequest is the create/update payload (Kegiatan leaf).
type SubstageRequest struct {
	ProgramStageID  string `json:"program_stage_id" validate:"required"`
	SequenceOrder   int    `json:"sequence_order"`
	Name            string `json:"name" validate:"required"`
	Description     string `json:"description,omitempty"`
	DurationMinutes int    `json:"duration_minutes"`
	IsPhotoStage    bool   `json:"is_photo_stage"`
}

// Create handles POST /api/program-substages.
func (h *ProgramSubstageHandler) Create(c *echo.Context) error {
	var req SubstageRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	s := &entity.ProgramSubstage{
		ProgramStageID:  req.ProgramStageID,
		SequenceOrder:   req.SequenceOrder,
		Name:            req.Name,
		Description:     req.Description,
		DurationMinutes: req.DurationMinutes,
		IsPhotoStage:    req.IsPhotoStage,
	}
	if err := h.repo.CreateSubstage((*c).Request().Context(), s); err != nil {
		return err
	}
	return appresp.Created(c, s)
}

// Get handles GET /api/program-substages/:id.
func (h *ProgramSubstageHandler) Get(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	s, err := h.repo.GetSubstageByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, s)
}

// List handles GET /api/program-substages?program_stage_id=.
func (h *ProgramSubstageHandler) List(c *echo.Context) error {
	programStageID := (*c).QueryParam("program_stage_id")
	if programStageID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	items, err := h.repo.ListSubstages((*c).Request().Context(), programStageID)
	if err != nil {
		return err
	}
	return appresp.OK(c, items)
}

// Update handles PUT /api/program-substages/:id.
func (h *ProgramSubstageHandler) Update(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	s, err := h.repo.GetSubstageByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	var req SubstageRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	s.SequenceOrder = req.SequenceOrder
	s.Name = req.Name
	s.Description = req.Description
	s.DurationMinutes = req.DurationMinutes
	s.IsPhotoStage = req.IsPhotoStage
	if err := h.repo.UpdateSubstage((*c).Request().Context(), s); err != nil {
		return err
	}
	return appresp.OK(c, s)
}

// Delete handles DELETE /api/program-substages/:id.
func (h *ProgramSubstageHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.repo.DeleteSubstage((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// Reorder handles POST /api/program-substages/reorder.
func (h *ProgramSubstageHandler) Reorder(c *echo.Context) error {
	var req dto.ReorderRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	// programStageID is not required by the contract here; the ordering is
	// applied by id across the provided ordered list (ReorderSubstages ignores
	// it and renumbers by id). Pass empty to keep the interface uniform.
	if err := h.repo.ReorderSubstages((*c).Request().Context(), "", req.OrderedIDs); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// BadgeHandler serves /api/badges/* (read participant badges).
type BadgeHandler struct {
	substageRepo repository.SessionSubstageRepository
}

// NewBadgeHandler builds the badge handler.
func NewBadgeHandler(substageRepo repository.SessionSubstageRepository) *BadgeHandler {
	return &BadgeHandler{substageRepo: substageRepo}
}

// List handles GET /api/badges?participant_id= (lists all badges for a participant).
func (h *BadgeHandler) List(c *echo.Context) error {
	participantID := (*c).QueryParam("participant_id")
	if participantID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	items, err := h.substageRepo.ListBadgesByParticipant((*c).Request().Context(), participantID)
	if err != nil {
		return err
	}
	return appresp.OK(c, items)
}

// SessionSubstageHandler serves the Live Monitor "Lanjut SubTopik" override at
// POST /api/session-substages/:id/complete (marks a Kegiatan leaf COMPLETED and
// re-runs per-child badge evaluation).
type SessionSubstageHandler struct {
	badgeUC *badgeuc.Usecase
}

// NewSessionSubstageHandler builds the session-substage handler.
func NewSessionSubstageHandler(badgeUC *badgeuc.Usecase) *SessionSubstageHandler {
	return &SessionSubstageHandler{badgeUC: badgeUC}
}

// Complete handles POST /api/session-substages/:id/complete.
func (h *SessionSubstageHandler) Complete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.badgeUC.CompleteSessionSubstage((*c).Request().Context(), id, appmiddleware.GetTenantID(c)); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
