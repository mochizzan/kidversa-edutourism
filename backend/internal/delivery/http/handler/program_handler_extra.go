package handler

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
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
//
// Guard (audit #1): without ?force=true the delete is refused with 409
// program_has_sessions when the program still owns live sessions — the count
// and a short session list (id, name, status) ride in the message; the FE can
// fetch the full structured list via GET /api/sessions?program_id=... (the
// AppError type carries no meta, and pkg/response is not owned here).
// With ?force=true every session of the program (all statuses) is hard-deleted
// with its children and the program itself is hard-deleted in ONE transaction.
// A program without sessions is deleted as before (?force or not).
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
	ctx := (*c).Request().Context()
	if (*c).QueryParam("force") == "true" {
		// Hardening (Tahap 2 step 9): force-delete is refused with 409 when
		// the program owns COMPLETED sessions — those rows are the audit
		// archive (scores, badges, reports) and must not be purged.
		briefs, err := h.repo.ListProgramSessionBriefs(ctx, id, 100)
		if err != nil {
			return err
		}
		var completed []string
		for i := range briefs {
			if briefs[i].Status == entity.SessionCompleted {
				completed = append(completed, fmt.Sprintf("%s (%s)", briefs[i].ID, briefs[i].Name))
			}
		}
		if len(completed) > 0 {
			log.Printf("program: force-delete refused for %s: %d COMPLETED session(s): %s", id, len(completed), strings.Join(completed, ", "))
			msg := fmt.Sprintf("%s (%d sesi COMPLETED: %s).",
				appresp.MessageForCode("program_has_completed_sessions"), len(completed), strings.Join(completed, ", "))
			return appresp.FailMsg(c, http.StatusConflict, "program_has_completed_sessions", msg)
		}
		if err := h.repo.DeleteProgramForce(ctx, id); err != nil {
			return err
		}
		return appresp.NoContent(c)
	}
	n, err := h.repo.CountProgramSessions(ctx, id)
	if err != nil {
		return err
	}
	if n > 0 {
		briefs, err := h.repo.ListProgramSessionBriefs(ctx, id, 5)
		if err != nil {
			return err
		}
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
		msg := fmt.Sprintf("%s (%d sesi: %s) Gunakan ?force=true untuk menghapus paksa beserta sesinya.",
			appresp.MessageForCode("program_has_sessions"), n, b.String())
		return appresp.FailMsg(c, http.StatusConflict, "program_has_sessions", msg)
	}
	if err := h.repo.DeleteProgram(ctx, id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}
