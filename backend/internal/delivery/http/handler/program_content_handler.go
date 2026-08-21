package handler

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
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

// stageTenantID resolves the owning tenant of a Topik via Topik -> program.
func (h *ProgramHandler) stageTenantID(ctx context.Context, stageID string) string {
	stage, err := h.repo.GetStageByID(ctx, stageID)
	if err != nil {
		return ""
	}
	program, err := h.repo.GetProgramByID(ctx, stage.ProgramID)
	if err != nil {
		return ""
	}
	if program.TenantID == nil {
		return ""
	}
	return *program.TenantID
}

// substageTenantID resolves the owning tenant of a Kegiatan via
// Kegiatan -> Topik -> program.
func (h *ProgramHandler) substageTenantID(ctx context.Context, substage *entity.ProgramSubstage) string {
	return h.stageTenantID(ctx, substage.ProgramStageID)
}

// AssignContent handles POST /api/program-substages/:substageId/contents/assign.
// Assigns an existing standalone Content to the Kegiatan (junction insert, A6a one-per-stage).
func (h *ProgramHandler) AssignContent(c *echo.Context) error {
	substageID, ok := bindUUID(c, "substageId")
	if !ok {
		return nil
	}
	substage, err := h.substageRepo.GetSubstageByID((*c).Request().Context(), substageID)
	if err != nil {
		return appresp.Fail(c, http.StatusNotFound, "substage_not_found")
	}
	var req dto.AssignContentRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	tenantID := h.substageTenantID((*c).Request().Context(), substage)
	// E13: the content must belong to the same tenant as the Kegiatan's program.
	if !h.contentBelongsToTenant((*c).Request().Context(), req.ContentID, tenantID) {
		return appresp.Fail(c, http.StatusForbidden, "content_tenant_mismatch")
	}
	if err := h.contentRepo.AssignContentToStage((*c).Request().Context(), substage.ID, req.ContentID); err != nil {
		// A6a: idempotent if already assigned.
		return err
	}
	return appresp.Created(c, map[string]string{"content_id": req.ContentID, "substage_id": substage.ID})
}

// UnassignContent handles DELETE /api/program-substages/:substageId/contents/:contentId.
// Removes the junction only — the Content itself is NOT deleted (A4a/CRIT-5).
func (h *ProgramHandler) UnassignContent(c *echo.Context) error {
	substageID, ok := bindUUID(c, "substageId")
	if !ok {
		return nil
	}
	substage, err := h.substageRepo.GetSubstageByID((*c).Request().Context(), substageID)
	if err != nil {
		return appresp.Fail(c, http.StatusNotFound, "substage_not_found")
	}
	contentID, ok := bindUUID(c, "contentId")
	if !ok {
		return nil
	}
	if err := h.contentRepo.UnassignContentFromStage((*c).Request().Context(), substage.ID, contentID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ReorderContents handles POST /api/program-substages/:substageId/contents/reorder.
func (h *ProgramHandler) ReorderContents(c *echo.Context) error {
	substageID, ok := bindUUID(c, "substageId")
	if !ok {
		return nil
	}
	substage, err := h.substageRepo.GetSubstageByID((*c).Request().Context(), substageID)
	if err != nil {
		return appresp.Fail(c, http.StatusNotFound, "substage_not_found")
	}
	var req dto.ReorderRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	if err := h.contentRepo.ReorderStageContents((*c).Request().Context(), substage.ID, req.OrderedIDs); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// contentBelongsToTenant reports whether the standalone content's owning tenant
// matches the Topik's tenant (E13 cross-tenant guard). An unassigned content
// (no Topik) resolves to an empty tenant and is rejected by the mismatch check.
func (h *ProgramHandler) contentBelongsToTenant(ctx context.Context, contentID, stageTenant string) bool {
	if stageTenant == "" {
		return false
	}
	ct, err := h.contentRepo.GetContentByID(ctx, contentID)
	if err != nil {
		return false
	}
	return ct.TenantID == stageTenant
}
