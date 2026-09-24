package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
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
	p, err := h.photos.GetPhotoByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
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
	res, err := h.photos.ListPhotos((*c).Request().Context(), f, page, limit)
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
	ctx := (*c).Request().Context()
	// Tenant check: only photos in the caller's tenant may be deleted.
	if _, err := h.photos.GetPhotoByID(ctx, id, appmiddleware.GetTenantID(c)); err != nil {
		return err
	}
	if err := h.photos.DeletePhoto(ctx, id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// Update handles PUT /api/photos/:id (partial map update, C2 zero-value safe).
// is_report_photo is intentionally NOT part of this whitelist: the exclusive
// is_report_photo default is set via POST /:id/set-report-photo.
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
	if req.TakenBy != "" {
		fields["taken_by"] = req.TakenBy
	}
	if req.TakenAt != "" {
		if t, ok := apputil.ParseISO(req.TakenAt); ok {
			fields["taken_at"] = t
		} else {
			fields["taken_at"] = req.TakenAt
		}
	}
	if req.FrameID != "" {
		fid := req.FrameID
		fields["frame_id"] = &fid
	}
	if err := h.photos.UpdatePhotoFields((*c).Request().Context(), id, fields); err != nil {
		return err
	}
	p, err := h.photos.GetPhotoByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
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
	p, err := h.photos.GetPhotoByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	if err := h.photos.SetReportPhoto((*c).Request().Context(), p.ParticipantID, p.SessionID, id); err != nil {
		return err
	}
	updated, err := h.photos.GetPhotoByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewPhotoResponse(updated))
}

// SetReportPick upserts this participant's chosen report photo for one topic.
func (h *PhotoHandler) SetReportPick(c *echo.Context) error {
	var req dto.ReportPhotoPickRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	ctx := (*c).Request().Context()
	p, err := h.photos.GetPhotoByID(ctx, req.PhotoID, appmiddleware.GetTenantID(c))
	if err != nil {
		return err // cross-tenant / missing photo -> 404 not_found
	}
	if p.ParticipantID != req.ParticipantID || p.SessionID != req.SessionID {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	pick := &entity.ReportPhotoPick{
		ParticipantID:  req.ParticipantID,
		SessionID:      req.SessionID,
		ProgramStageID: req.ProgramStageID,
		PhotoID:        req.PhotoID,
	}
	if err := h.photos.UpsertReportPhotoPick(ctx, pick); err != nil {
		return err
	}
	return appresp.OK(c, dto.NewPhotoResponse(p))
}

// DeleteReportPick clears the pick for one topic (idempotent).
func (h *PhotoHandler) DeleteReportPick(c *echo.Context) error {
	participantID := (*c).QueryParam("participant_id")
	sessionID := (*c).QueryParam("session_id")
	programStageID := (*c).QueryParam("program_stage_id")
	if participantID == "" || sessionID == "" || programStageID == "" ||
		uuid.Validate(participantID) != nil || uuid.Validate(sessionID) != nil || uuid.Validate(programStageID) != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	if err := h.photos.DeleteReportPhotoPick((*c).Request().Context(), participantID, sessionID, programStageID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ListReportPicks returns all topic picks for one participant+session.
func (h *PhotoHandler) ListReportPicks(c *echo.Context) error {
	participantID := (*c).QueryParam("participant_id")
	sessionID := (*c).QueryParam("session_id")
	if participantID == "" || sessionID == "" ||
		uuid.Validate(participantID) != nil || uuid.Validate(sessionID) != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	picks, err := h.photos.ListReportPhotoPicks((*c).Request().Context(), participantID, sessionID)
	if err != nil {
		return err
	}
	resp := make([]dto.ReportPhotoPickResponse, 0, len(picks))
	for _, pk := range picks {
		resp = append(resp, dto.ReportPhotoPickResponse{ProgramStageID: pk.ProgramStageID, PhotoID: pk.PhotoID})
	}
	return appresp.OK(c, resp)
}
