package handler

import (
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
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

// List handles GET /api/attendance?session_id=xxx.
func (h *AttendanceHandler) List(c *echo.Context) error {
	sessionID := (*c).QueryParam("session_id")
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	items, err := h.uc.ListBySession((*c).Request().Context(), sessionID, tenantID)
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
	a, err := h.uc.Upsert((*c).Request().Context(), req.ParticipantID, req.SessionID, req.IsPresent, actorID, tenantID)
	if err != nil {
		return err
	}
	return appresp.Created(c, dto.NewAttendanceResponse(a))
}

// BulkUpsert handles POST /api/attendance/bulk-upsert.
func (h *AttendanceHandler) BulkUpsert(c *echo.Context) error {
	var req dto.AttendanceBulkUpsertRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	actorID := appmiddleware.GetUserID(c)
	items := make([]entity.ParticipantAttendance, 0, len(req.Items))
	for _, r := range req.Items {
		items = append(items, entity.ParticipantAttendance{
			ParticipantID: r.ParticipantID,
			SessionID:     r.SessionID,
			IsPresent:     r.IsPresent,
		})
	}
	if err := h.uc.BulkUpsert((*c).Request().Context(), items, actorID, tenantID); err != nil {
		return err
	}
	return appresp.OK(c, items)
}
