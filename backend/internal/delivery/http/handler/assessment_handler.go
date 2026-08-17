package handler

import (
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
	assessmentuc "kidversa-edutourism-backend/internal/usecase/assessment"
)

// AssessmentHandler serves /api/assessments/*.
type AssessmentHandler struct {
	uc *assessmentuc.Usecase
}

// NewAssessmentHandler builds the assessment handler.
func NewAssessmentHandler(uc *assessmentuc.Usecase) *AssessmentHandler {
	return &AssessmentHandler{uc: uc}
}

// Upsert handles POST /api/assessments/upsert.
func (h *AssessmentHandler) Upsert(c *echo.Context) error {
	var req dto.AssessmentUpsertRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	a, err := h.uc.Upsert((*c).Request().Context(),
		repository.AssessmentFilter{ParticipantID: req.ParticipantID, SessionID: req.SessionID, SessionStageID: req.SessionStageID},
		req.StarRating, req.Comment, req.AssessedBy, appmiddleware.GetUserID(c), appmiddleware.GetRole(c), apputil.ParseISOOrNow(req.AssessedAt), req.SyncStatus)
	if err != nil {
		return err
	}
	return appresp.Created(c, dto.NewAssessmentResponse(a))
}

// BulkUpsert handles POST /api/assessments/bulk-upsert.
func (h *AssessmentHandler) BulkUpsert(c *echo.Context) error {
	var req dto.AssessmentBulkUpsertRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	items := make([]entity.Assessment, 0, len(req.Items))
	for i := range req.Items {
		it := req.Items[i]
		items = append(items, entity.Assessment{
			ParticipantID:  it.ParticipantID,
			SessionID:      it.SessionID,
			SessionStageID: it.SessionStageID,
			StarRating:     it.StarRating,
			Comment:        it.Comment,
			AssessedBy:     it.AssessedBy,
			AssessedAt:     apputil.ParseISOOrNow(it.AssessedAt),
			SyncStatus:     entity.SyncStatus(it.SyncStatus),
		})
	}
	out, err := h.uc.BulkUpsert((*c).Request().Context(), items, appmiddleware.GetUserID(c), appmiddleware.GetRole(c))
	if err != nil {
		return err
	}
	return appresp.Created(c, out)
}

// List handles GET /api/assessments (filter by ?participant_id= or ?session_id=).
func (h *AssessmentHandler) List(c *echo.Context) error {
	f := repository.AssessmentFilter{
		ParticipantID:  (*c).QueryParam("participant_id"),
		SessionID:      (*c).QueryParam("session_id"),
		SessionStageID: (*c).QueryParam("session_stage_id"),
	}
	page, limit := pagination(c)
	res, err := h.uc.List((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	items := make([]*dto.AssessmentResponse, 0, len(res.Items))
	for i := range res.Items {
		items = append(items, dto.NewAssessmentResponse(&res.Items[i]))
	}
	return appresp.OKWithMeta(c, items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// Delete handles DELETE /api/assessments/:id.
func (h *AssessmentHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.Delete((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
