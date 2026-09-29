package handler

import (
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
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
		repository.AssessmentFilter{ParticipantID: req.ParticipantID, SessionID: req.SessionID, SessionSubstageID: req.SessionSubstageID},
		req.StarRating, req.Comment, appmiddleware.GetUserID(c), appmiddleware.GetUserID(c), appmiddleware.GetRole(c), apputil.ParseISOOrNow(req.AssessedAt), req.SyncStatus, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.Created(c, dto.NewAssessmentResponse(a))
}

// List handles GET /api/assessments (filter by ?participant_id= or ?session_id=).
func (h *AssessmentHandler) List(c *echo.Context) error {
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	f := repository.AssessmentFilter{
		ParticipantID:     (*c).QueryParam("participant_id"),
		SessionID:         (*c).QueryParam("session_id"),
		SessionSubstageID: (*c).QueryParam("session_substage_id"),
		TenantID:          tenantID,
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
