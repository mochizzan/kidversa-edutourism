package handler

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ListContents handles GET /api/program-stages/:stageId/contents.
// Returns the JOIN-shaped StageContent list (kiosk/learner shape, E22/CRIT-7).
func (h *ProgramHandler) ListContents(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	items, err := h.contentRepo.ListStageContents((*c).Request().Context(), stageID)
	if err != nil {
		return err
	}
	return appresp.OK(c, items)
}

// stageTenantID resolves the owning tenant of a stage via stage -> program.
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

// AssignContent handles POST /api/program-stages/:stageId/contents/assign.
// Assigns an existing standalone Content to the stage (junction insert, A6a one-per-stage).
func (h *ProgramHandler) AssignContent(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	var req dto.AssignContentRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	tenantID := h.stageTenantID((*c).Request().Context(), stageID)
	// E13: the content must belong to the same tenant as the stage.
	if !h.contentBelongsToTenant((*c).Request().Context(), req.ContentID, tenantID) {
		return appresp.Fail(c, http.StatusForbidden, "content_tenant_mismatch")
	}
	if err := h.contentRepo.AssignContentToStage((*c).Request().Context(), stageID, req.ContentID); err != nil {
		// A6a: idempotent if already assigned.
		return err
	}
	return appresp.Created(c, map[string]string{"content_id": req.ContentID, "stage_id": stageID})
}

// UnassignContent handles DELETE /api/program-stages/:stageId/contents/:contentId.
// Removes the junction only — the Content itself is NOT deleted (A4a/CRIT-5).
func (h *ProgramHandler) UnassignContent(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	contentID, ok := bindUUID(c, "contentId")
	if !ok {
		return nil
	}
	if err := h.contentRepo.UnassignContentFromStage((*c).Request().Context(), stageID, contentID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ReorderContents handles POST /api/program-stages/:stageId/contents/reorder.
func (h *ProgramHandler) ReorderContents(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	var req dto.ReorderRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	if err := h.contentRepo.ReorderStageContents((*c).Request().Context(), stageID, req.OrderedIDs); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// contentBelongsToTenant reports whether the standalone content's owning tenant
// matches the stage's tenant (E13 cross-tenant guard). An unassigned content
// (no stage) resolves to an empty tenant and is rejected by the mismatch check.
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
