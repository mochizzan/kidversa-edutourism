package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
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

// Update handles PUT /api/photos/:id (partial map update, C2 zero-value safe).
func (h *PhotoHandler) Update(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.PhotoRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	fields := map[string]interface{}{}
	if req.FramedFileURL != "" {
		fields["framed_file_url"] = req.FramedFileURL
	}
	fields["is_report_photo"] = req.IsReportPhoto
	if req.TakenBy != "" {
		fields["taken_by"] = req.TakenBy
	}
	if req.TakenAt != "" {
		fields["taken_at"] = req.TakenAt
	}
	if req.FrameID != "" {
		fields["frame_id"] = req.FrameID
	}
	if err := h.photos.UpdateFields((*c).Request().Context(), id, fields); err != nil {
		return err
	}
	p, err := h.photos.GetByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewPhotoResponse(p))
}

// SetReportPhoto handles POST /api/photos/:id/set-report-photo (exclusive flag).
func (h *PhotoHandler) SetReportPhoto(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	p, err := h.photos.GetByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	if err := h.photos.SetReportPhoto((*c).Request().Context(), p.ParticipantID, p.SessionID, id); err != nil {
		return err
	}
	updated, err := h.photos.GetByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewPhotoResponse(updated))
}

// ensure import referenced.
var _ = appmiddleware.GetUserID
