package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ListStages handles GET /api/programs/:id/stages.
func (h *ProgramHandler) ListStages(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	stages, err := h.repo.ListStages((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, stages)
}

// CreateStage handles POST /api/programs/:id/stages.
func (h *ProgramHandler) CreateStage(c *echo.Context) error {
	programID, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.ProgramStageRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	s := &entity.ProgramStage{
		ProgramID: programID, SequenceOrder: req.SequenceOrder, Name: req.Name,
		Description: req.Description, ContentType: req.ContentType, DurationMinutes: req.DurationMinutes,
		IsRecordingStage: req.IsRecordingStage, IsPhotoStage: req.IsPhotoStage,
	}
	if err := h.repo.CreateStage((*c).Request().Context(), s); err != nil {
		return err
	}
	return appresp.Created(c, s)
}

// UpdateStage handles PUT /api/programs/:id/stages/:stageId.
func (h *ProgramHandler) UpdateStage(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	s, err := h.repo.GetStageByID((*c).Request().Context(), stageID)
	if err != nil {
		return err
	}
	var req dto.ProgramStageRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if req.Name != "" {
		s.Name = req.Name
	}
	if req.Description != "" {
		s.Description = req.Description
	}
	if req.ContentType != "" {
		s.ContentType = req.ContentType
	}
	s.SequenceOrder = req.SequenceOrder
	s.DurationMinutes = req.DurationMinutes
	s.IsRecordingStage = req.IsRecordingStage
	s.IsPhotoStage = req.IsPhotoStage
	if err := h.repo.UpdateStage((*c).Request().Context(), s); err != nil {
		return err
	}
	return appresp.OK(c, s)
}

// DeleteStage handles DELETE /api/programs/:id/stages/:stageId.
func (h *ProgramHandler) DeleteStage(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	if err := h.repo.DeleteStage((*c).Request().Context(), stageID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ReorderStages handles POST /api/programs/:id/stages/reorder.
func (h *ProgramHandler) ReorderStages(c *echo.Context) error {
	programID, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.ReorderRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	if err := h.repo.ReorderStages((*c).Request().Context(), programID, req.OrderedIDs); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
