package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// Update handles PUT /api/frames/:id.
func (h *FrameHandler) Update(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	f, err := h.repo.GetByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	var req dto.FrameRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	f.ProgramID = req.ProgramID
	f.Name = req.Name
	f.FileURL = req.FileURL
	f.ThumbnailURL = req.ThumbnailURL
	f.IsActive = req.IsActive
	f.SortOrder = req.SortOrder
	if err := h.repo.Update((*c).Request().Context(), f); err != nil {
		return err
	}
	return appresp.OK(c, dto.NewFrameResponse(f))
}

// Delete handles DELETE /api/frames/:id.
func (h *FrameHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.repo.Delete((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ensure import referenced.
var _ = appmiddleware.GetUserID
