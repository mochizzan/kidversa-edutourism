package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ListContents handles GET /api/program-substages/:substageId/contents.
// Returns the JOIN-shaped StageContent list (kiosk/learner shape, E22/CRIT-7).
func (h *ProgramHandler) ListContents(c *echo.Context) error {
	substageID, ok := bindUUID(c, "substageId")
	if !ok {
		return nil
	}
	substage, err := h.substageRepo.GetSubstageByID((*c).Request().Context(), substageID)
	if err != nil {
		return appresp.Fail(c, http.StatusNotFound, "substage_not_found")
	}
	items, err := h.contentRepo.ListStageContents((*c).Request().Context(), substage.ID)
	if err != nil {
		return err
	}
	return appresp.OK(c, items)
}
