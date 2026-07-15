package handler

import (
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// Update handles PUT /api/mission-banks/:id.
func (h *MissionBankHandler) Update(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	m, err := h.repo.GetByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	var req dto.MissionBankRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	m.ProgramID = req.ProgramID
	m.Category = entity.MissionCategory(req.Category)
	m.TitleChild = req.TitleChild
	m.TitleParent = req.TitleParent
	m.DescriptionParent = req.DescriptionParent
	m.RelatedStageIDs = req.RelatedStageIDs
	m.IsActive = req.IsActive
	if err := h.repo.Update((*c).Request().Context(), m); err != nil {
		return err
	}
	return appresp.OK(c, dto.NewMissionBankResponse(m))
}

// Delete handles DELETE /api/mission-banks/:id.
func (h *MissionBankHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.repo.Delete((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ToggleActive handles POST /api/mission-banks/:id/toggle-active (flip IsActive via map, C2).
func (h *MissionBankHandler) ToggleActive(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	m, err := h.repo.GetByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	fields := map[string]interface{}{"is_active": !m.IsActive}
	if err := h.repo.UpdateFields((*c).Request().Context(), id, fields); err != nil {
		return err
	}
	updated, err := h.repo.GetByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewMissionBankResponse(updated))
}
