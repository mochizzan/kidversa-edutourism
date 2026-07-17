package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
)

// RecordingHandler serves /api/recordings/* (CRUD + review over Recording rows).
type RecordingHandler struct {
	recordings repository.RecordingRepository
}

// NewRecordingHandler builds the recording handler.
func NewRecordingHandler(recordings repository.RecordingRepository) *RecordingHandler {
	return &RecordingHandler{recordings: recordings}
}

// GetByID handles GET /api/recordings/:id.
func (h *RecordingHandler) GetByID(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	r, err := h.recordings.GetByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewRecordingResponse(r))
}

// List handles GET /api/recordings.
func (h *RecordingHandler) List(c *echo.Context) error {
	f := repository.RecordingFilter{
		ParticipantID:  (*c).QueryParam("participant_id"),
		SessionID:      (*c).QueryParam("session_id"),
		SessionStageID: (*c).QueryParam("session_stage_id"),
		ReviewStatus:   (*c).QueryParam("review_status"),
	}
	page, limit := pagination(c)
	res, err := h.recordings.List((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, dto.NewRecordingListResponse(res.Items), &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// Review handles POST /api/recordings/:id/review.
func (h *RecordingHandler) Review(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.RecordingReviewRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	r, err := h.recordings.GetByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	r.ReviewStatus = entity.RecordingsReviewStatus(req.ReviewStatus)
	by := req.ReviewedBy
	r.ReviewedBy = &by
	if req.Transcript != nil {
		r.TranscriptText = *req.Transcript
	}
	if err := h.recordings.Update((*c).Request().Context(), r); err != nil {
		return err
	}
	return appresp.OK(c, dto.NewRecordingResponse(r))
}

// Delete handles DELETE /api/recordings/:id.
func (h *RecordingHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.recordings.Delete((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// Update handles PUT /api/recordings/:id (partial map update, C2 zero-value safe).
func (h *RecordingHandler) Update(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.RecordingRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	fields := map[string]interface{}{}
	if req.FileURL != "" {
		fields["file_url"] = req.FileURL
	}
	fields["duration_seconds"] = req.DurationSeconds
	if req.TranscriptText != "" {
		fields["transcript_text"] = req.TranscriptText
	}
	if req.ReviewStatus != "" {
		fields["review_status"] = req.ReviewStatus
	}
	if req.ReviewedBy != "" {
		fields["reviewed_by"] = req.ReviewedBy
	}
	if req.ReviewedAt != "" {
		if t, ok := apputil.ParseISO(req.ReviewedAt); ok {
			fields["reviewed_at"] = t
		} else {
			fields["reviewed_at"] = req.ReviewedAt
		}
	}
	if err := h.recordings.UpdateFields((*c).Request().Context(), id, fields); err != nil {
		return err
	}
	r, err := h.recordings.GetByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewRecordingResponse(r))
}
