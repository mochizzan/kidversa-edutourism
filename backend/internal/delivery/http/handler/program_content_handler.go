package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ListContents handles GET /api/program-stages/:stageId/contents.
func (h *ProgramHandler) ListContents(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	items, err := h.repo.ListContents((*c).Request().Context(), stageID)
	if err != nil {
		return err
	}
	return appresp.OK(c, items)
}

// CreateContent handles POST /api/program-stages/:stageId/contents.
func (h *ProgramHandler) CreateContent(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	var req dto.StageContentRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	active := true
	if req.IsActive != nil {
		active = *req.IsActive
	}
	ct := &entity.StageContent{
		ProgramStageID: stageID, Title: req.Title, FileURL: req.FileURL, YouTubeURL: req.YouTubeURL,
		FileType: req.FileType, DurationSeconds: req.DurationSeconds, SortOrder: req.SortOrder, IsActive: active,
	}
	if err := h.repo.CreateContent((*c).Request().Context(), ct); err != nil {
		return err
	}
	return appresp.Created(c, ct)
}

// UpdateContent handles PUT /api/program-stages/:stageId/contents/:contentId.
func (h *ProgramHandler) UpdateContent(c *echo.Context) error {
	contentID, ok := bindUUID(c, "contentId")
	if !ok {
		return nil
	}
	ct, err := h.repo.GetContentByID((*c).Request().Context(), contentID)
	if err != nil {
		return err
	}
	var req dto.StageContentRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if req.Title != "" {
		ct.Title = req.Title
	}
	if req.FileURL != "" {
		ct.FileURL = req.FileURL
	}
	if req.FileType != "" {
		ct.FileType = req.FileType
	}
	// YouTubeURL is set unconditionally from the payload: an empty string clears
	// it (e.g. when switching a YouTube video back to a manual upload).
	ct.YouTubeURL = req.YouTubeURL
	ct.DurationSeconds = req.DurationSeconds
	ct.SortOrder = req.SortOrder
	if req.IsActive != nil {
		ct.IsActive = *req.IsActive
	}
	if err := h.repo.UpdateContent((*c).Request().Context(), ct); err != nil {
		return err
	}
	return appresp.OK(c, ct)
}

// DeleteContent handles DELETE /api/program-stages/:stageId/contents/:contentId.
func (h *ProgramHandler) DeleteContent(c *echo.Context) error {
	contentID, ok := bindUUID(c, "contentId")
	if !ok {
		return nil
	}
	if err := h.repo.DeleteContent((*c).Request().Context(), contentID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ReorderContents handles POST /api/program-stages/:stageId/contents/reorder.
func (h *ProgramHandler) ReorderContents(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	var req dto.ReorderRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	if err := h.repo.ReorderContents((*c).Request().Context(), stageID, req.OrderedIDs); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
