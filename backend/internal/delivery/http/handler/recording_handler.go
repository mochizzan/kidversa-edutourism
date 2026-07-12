package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
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
	r, err := h.recordings.GetByID((*c).Request().Context(), id)
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
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	r, err := h.recordings.GetByID((*c).Request().Context(), id)
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
