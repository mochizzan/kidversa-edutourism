package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	attendanceuc "kidversa-edutourism-backend/internal/usecase/attendance"
)

// AttendanceHandler serves /api/attendance/*.
type AttendanceHandler struct {
	uc *attendanceuc.Usecase
}

// NewAttendanceHandler builds the attendance handler.
func NewAttendanceHandler(uc *attendanceuc.Usecase) *AttendanceHandler {
	return &AttendanceHandler{uc: uc}
}

// List handles GET /api/attendance?session_id=xxx[&session_stage_id=yyy].
// session_stage_id narrows the read to one Topik; empty keeps the
// session-wide compat behavior (all Topics).
func (h *AttendanceHandler) List(c *echo.Context) error {
	q := dto.AttendanceListQuery{
		SessionID:      (*c).QueryParam("session_id"),
		SessionStageID: (*c).QueryParam("session_stage_id"),
	}
	if err := (*c).Validate(q); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	items, err := h.uc.ListBySessionStage((*c).Request().Context(), q.SessionID, q.SessionStageID, tenantID)
	if err != nil {
		return err
	}
	resp := make([]*dto.AttendanceResponse, 0, len(items))
	for i := range items {
		resp = append(resp, dto.NewAttendanceResponse(&items[i]))
	}
	return appresp.OK(c, resp)
}

// Upsert handles POST /api/attendance/upsert.
func (h *AttendanceHandler) Upsert(c *echo.Context) error {
	var req dto.AttendanceUpsertRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	actorID := appmiddleware.GetUserID(c)
	a, err := h.uc.Upsert((*c).Request().Context(), req.ParticipantID, req.SessionID, req.SessionStageID, req.IsPresent, actorID, tenantID)
	if err != nil {
		return err
	}
	return appresp.Created(c, dto.NewAttendanceResponse(a))
}
