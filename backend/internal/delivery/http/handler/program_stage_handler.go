package handler

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// stageUsageMessage builds the 409 body behind stage_has_sessions /
// substage_has_sessions, mirroring the program_has_sessions copy in
// program_handler_extra.go: "<base> (<n> sesi: <id (nama, status), ...>)".
func stageUsageMessage(code string, n int64, briefs []entity.Session) string {
	var b strings.Builder
	for i, s := range briefs {
		if i > 0 {
			b.WriteString(", ")
		}
		fmt.Fprintf(&b, "%s (%s, %s)", s.ID, s.Name, s.Status)
	}
	if extra := n - int64(len(briefs)); extra > 0 {
		fmt.Fprintf(&b, ", …+%d lagi", extra)
	}
	return fmt.Sprintf("%s (%d sesi: %s)",
		appresp.MessageForCode(code), n, b.String())
}

// ListStages handles GET /api/programs/:id/stages.
func (h *ProgramHandler) ListStages(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	if _, err := loadProgramAndCheckTenant(ctx, h.repo, id, appmiddleware.GetTenantID(c)); err != nil {
		return err
	}
	stages, err := h.repo.ListStages(ctx, id)
	if err != nil {
		return err
	}
	return appresp.OK(c, stages)
}

// ListProgramStages handles GET /api/program-stages?program_id=...&search=...&page=...&limit=...
func (h *ProgramHandler) ListProgramStages(c *echo.Context) error {
	page, limit := pagination(c)
	ctx := (*c).Request().Context()
	caller := appmiddleware.GetTenantID(c)
	if pid := (*c).QueryParam("program_id"); pid != "" {
		if _, err := loadProgramAndCheckTenant(ctx, h.repo, pid, caller); err != nil {
			return err
		}
	}
	f := repository.StageFilter{
		ProgramID: (*c).QueryParam("program_id"),
		Search:    (*c).QueryParam("search"),
		TenantID:  caller,
	}
	res, err := h.repo.ListPaginatedStages(ctx, f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, res.Items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// equalFoldTrim compares names case-insensitively after trimming spaces
// (app-level dedup helper; no schema change).
func equalFoldTrim(a, b string) bool {
	return strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b))
}

// stageNameExists reports whether a Topik name already exists in the program
// (case-insensitive app-level dedup; no schema change).
func (h *ProgramHandler) stageNameExists(ctx context.Context, programID, name string) (bool, error) {
	res, err := h.repo.ListPaginatedStages(ctx, repository.StageFilter{ProgramID: programID}, 1, 100)
	if err != nil {
		return false, err
	}
	for i := range res.Items {
		if equalFoldTrim(res.Items[i].Name, name) {
			return true, nil
		}
	}
	return false, nil
}

// programNameExists reports whether a program name already exists in the
// caller's tenant (case-insensitive app-level dedup; no schema change).
func (h *ProgramHandler) programNameExists(ctx context.Context, tenantID, name string) (bool, error) {
	res, err := h.repo.ListPrograms(ctx, repository.ProgramFilter{TenantID: tenantID}, 1, 100)
	if err != nil {
		return false, err
	}
	for i := range res.Items {
		if equalFoldTrim(res.Items[i].Name, name) {
			return true, nil
		}
	}
	return false, nil
}

// CreateStage handles POST /api/programs/:id/stages.
func (h *ProgramHandler) CreateStage(c *echo.Context) error {
	programID, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	caller := appmiddleware.GetTenantID(c)
	if _, err := loadProgramAndCheckTenant(ctx, h.repo, programID, caller); err != nil {
		return err
	}
	var req dto.ProgramStageRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	if duplicate, derr := h.stageNameExists(ctx, programID, req.Name); derr != nil {
		return derr
	} else if duplicate {
		return appresp.Fail(c, http.StatusConflict, "conflict")
	}
	seq := 0
	if req.SequenceOrder != nil {
		seq = *req.SequenceOrder
	}
	s := &entity.ProgramStage{
		ProgramID: programID, SequenceOrder: seq, Name: req.Name,
		Description: req.Description, ContentType: req.ContentType,
	}
	if err := h.repo.CreateStage(ctx, s); err != nil {
		return err
	}
	return appresp.Created(c, s)
}

// UpdateStage handles PUT /api/programs/:id/stages/:stageId.
func (h *ProgramHandler) UpdateStage(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	s, _, err := resolveStageProgram(ctx, h.repo, stageID, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	var req dto.ProgramStageRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	if req.Name != "" {
		s.Name = req.Name
	}
	if req.Description != "" {
		s.Description = req.Description
	}
	if req.ContentType != "" {
		s.ContentType = req.ContentType
	}
	if req.SequenceOrder != nil {
		s.SequenceOrder = *req.SequenceOrder
	}
	if req.BadgeName != nil {
		s.BadgeName = *req.BadgeName
	}
	if req.BadgeImageURL != nil {
		s.BadgeImageURL = *req.BadgeImageURL
	}
	if err := h.repo.UpdateStage(ctx, s); err != nil {
		return err
	}
	return appresp.OK(c, s)
}

// DeleteStage handles DELETE /api/programs/:id/stages/:stageId.
//
// Guard (Tahap 2 step 6): the delete is refused with 409 stage_has_sessions
// when live rows still reference the Topik — the count and a short session
// list (id, name, status) ride in the message; the FE can fetch the full
// structured usage via GET /api/sessions?program_id=... (the AppError type
// carries no meta, and pkg/response is not owned here).
func (h *ProgramHandler) DeleteStage(c *echo.Context) error {
	stageID, ok := bindUUID(c, "stageId")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	if _, _, err := resolveStageProgram(ctx, h.repo, stageID, appmiddleware.GetTenantID(c)); err != nil {
		return err
	}
	n, err := h.repo.CountStageUsage(ctx, stageID)
	if err != nil {
		return err
	}
	if n > 0 {
		briefs, err := h.repo.ListStageSessionBriefs(ctx, stageID, 5)
		if err != nil {
			return err
		}
		return appresp.FailMsg(c, http.StatusConflict, "stage_has_sessions", stageUsageMessage("stage_has_sessions", n, briefs))
	}
	if err := h.repo.DeleteStage(ctx, stageID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
