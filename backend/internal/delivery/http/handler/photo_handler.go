package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// PhotoHandler serves /api/photos/* (CRUD over SmartPhoto records). Upload is a
// separate endpoint (RegisterUploadRoutes); this handler covers read/update/delete.
type PhotoHandler struct {
	photos repository.PhotoRepository
}

// NewPhotoHandler builds the photo handler.
func NewPhotoHandler(photos repository.PhotoRepository) *PhotoHandler {
	return &PhotoHandler{photos: photos}
}

// GetByID handles GET /api/photos/:id.
func (h *PhotoHandler) GetByID(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	p, err := h.photos.GetByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewPhotoResponse(p))
}

// List handles GET /api/photos (filter by ?participant_id= or ?session_id=).
func (h *PhotoHandler) List(c *echo.Context) error {
	f := repository.PhotoFilter{
		ParticipantID: (*c).QueryParam("participant_id"),
		SessionID:     (*c).QueryParam("session_id"),
	}
	page, limit := pagination(c)
	res, err := h.photos.List((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, dto.NewPhotoListResponse(res.Items), &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// Delete handles DELETE /api/photos/:id.
func (h *PhotoHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.photos.Delete((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ensure import referenced.
var _ = appmiddleware.GetUserID
