package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ToggleActive handles POST /api/programs/:id/toggle-active.
func (h *ProgramHandler) ToggleActive(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	p, err := h.repo.GetProgramByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	// Enforce tenant isolation (mirrors media_handler.go:169).
	if caller := appmiddleware.GetTenantID(c); caller != "" && derefTenant(p.TenantID) != caller {
		return appresp.Fail(c, http.StatusForbidden, "forbidden")
	}
	p, err = h.repo.ToggleActiveProgram((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, &dto.ToggleActiveResponse{ID: p.ID, IsActive: p.IsActive})
}

// Delete handles DELETE /api/programs/:id.
func (h *ProgramHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	p, err := h.repo.GetProgramByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	// Enforce tenant isolation (mirrors media_handler.go:169).
	if caller := appmiddleware.GetTenantID(c); caller != "" && derefTenant(p.TenantID) != caller {
		return appresp.Fail(c, http.StatusForbidden, "forbidden")
	}
	if err := h.repo.DeleteProgram((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
