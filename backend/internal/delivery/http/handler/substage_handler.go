package handler

import (
	"context"
	"log"
	"net/http"

	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
	badgeuc "kidversa-edutourism-backend/internal/usecase/badge"
)

// ProgramSubstageHandler serves /api/program-substages/* (CRUD over Kegiatan).
type ProgramSubstageHandler struct {
	repo     repository.ProgramSubstageRepository
	programs repository.ProgramRepository
}

// NewProgramSubstageHandler builds the program-substage handler. programs
// resolves the parent Topik/program for tenant isolation (Tahap 1); it may
// be nil in unit tests that never touch parent resolution.
func NewProgramSubstageHandler(repo repository.ProgramSubstageRepository, programs repository.ProgramRepository) *ProgramSubstageHandler {
	return &ProgramSubstageHandler{repo: repo, programs: programs}
}

// SubstageRequest is the create/update payload (Kegiatan leaf).
type SubstageRequest struct {
	ProgramStageID string `json:"program_stage_id" validate:"required"`
	SequenceOrder  int    `json:"sequence_order"`
	Name           string `json:"name" validate:"required"`
	Description    string `json:"description,omitempty"`
}

// Create handles POST /api/program-substages.
func (h *ProgramSubstageHandler) Create(c *echo.Context) error {
	var req SubstageRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	ctx := (*c).Request().Context()
	caller := appmiddleware.GetTenantID(c)
	if h.programs != nil {
		stage, err := h.programs.GetStageByID(ctx, req.ProgramStageID)
		if err != nil {
			return err
		}
		if _, err := loadProgramAndCheckTenant(ctx, h.programs, stage.ProgramID, caller); err != nil {
			return err
		}
		if duplicate, derr := h.substageNameExists(ctx, req.ProgramStageID, req.Name); derr != nil {
			return derr
		} else if duplicate {
			return appresp.Fail(c, http.StatusConflict, "conflict")
		}
	}
	s := &entity.ProgramSubstage{
		ProgramStageID: req.ProgramStageID,
		SequenceOrder:  req.SequenceOrder,
		Name:           req.Name,
		Description:    req.Description,
	}
	if err := h.repo.CreateSubstage(ctx, s); err != nil {
		return err
	}
	return appresp.Created(c, s)
}

// Get handles GET /api/program-substages/:id.
func (h *ProgramSubstageHandler) Get(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	s, err := h.repo.GetSubstageByID(ctx, id)
	if err != nil {
		return err
	}
	if h.programs != nil {
		stage, err := h.programs.GetStageByID(ctx, s.ProgramStageID)
		if err != nil {
			return err
		}
		if _, err := loadProgramAndCheckTenant(ctx, h.programs, stage.ProgramID, appmiddleware.GetTenantID(c)); err != nil {
			return err
		}
	}
	return appresp.OK(c, s)
}

// List handles GET /api/program-substages?program_stage_id=...&program_id=...&search=...&page=...&limit=...
func (h *ProgramSubstageHandler) List(c *echo.Context) error {
	programStageID := (*c).QueryParam("program_stage_id")
	programID := (*c).QueryParam("program_id")

	ctx := (*c).Request().Context()
	caller := appmiddleware.GetTenantID(c)
	if h.programs != nil {
		if programStageID != "" {
			stage, err := h.programs.GetStageByID(ctx, programStageID)
			if err != nil {
				return err
			}
			if _, err := loadProgramAndCheckTenant(ctx, h.programs, stage.ProgramID, caller); err != nil {
				return err
			}
		} else if programID != "" {
			if _, err := loadProgramAndCheckTenant(ctx, h.programs, programID, caller); err != nil {
				return err
			}
		}
	}

	page, limit := pagination(c)
	f := repository.SubstageFilter{
		ProgramStageID: programStageID,
		ProgramID:      programID,
		Search:         (*c).QueryParam("search"),
		TenantID:       caller,
	}
	res, err := h.repo.ListPaginatedSubstages(ctx, f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, res.Items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// Update handles PUT /api/program-substages/:id.
func (h *ProgramSubstageHandler) Update(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	s, err := h.repo.GetSubstageByID(ctx, id)
	if err != nil {
		return err
	}
	if h.programs != nil {
		stage, err := h.programs.GetStageByID(ctx, s.ProgramStageID)
		if err != nil {
			return err
		}
		if _, err := loadProgramAndCheckTenant(ctx, h.programs, stage.ProgramID, appmiddleware.GetTenantID(c)); err != nil {
			return err
		}
	}
	var req SubstageRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	if h.programs != nil && req.ProgramStageID != "" && req.ProgramStageID != s.ProgramStageID {
		stage, err := h.programs.GetStageByID(ctx, req.ProgramStageID)
		if err != nil {
			return err
		}
		if _, err := loadProgramAndCheckTenant(ctx, h.programs, stage.ProgramID, appmiddleware.GetTenantID(c)); err != nil {
			return err
		}
		s.ProgramStageID = req.ProgramStageID
	}
	s.SequenceOrder = req.SequenceOrder
	s.Name = req.Name
	s.Description = req.Description
	if err := h.repo.UpdateSubstage(ctx, s); err != nil {
		return err
	}
	return appresp.OK(c, s)
}

// Delete handles DELETE /api/program-substages/:id.
//
// Guard (Tahap 2 step 7): the delete is refused with 409
// substage_has_sessions when live session_substages still reference the
// Kegiatan — the count and a short session list (id, name, status) ride in
// the message. No purge/cascade is added: the row is soft-deleted only when
// unused.
func (h *ProgramSubstageHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	if h.programs != nil {
		s, err := h.repo.GetSubstageByID(ctx, id)
		if err != nil {
			return err
		}
		stage, err := h.programs.GetStageByID(ctx, s.ProgramStageID)
		if err != nil {
			return err
		}
		if _, err := loadProgramAndCheckTenant(ctx, h.programs, stage.ProgramID, appmiddleware.GetTenantID(c)); err != nil {
			return err
		}
	}
	n, err := h.repo.CountSubstageUsage(ctx, id)
	if err != nil {
		return err
	}
	if n > 0 {
		briefs, err := h.repo.ListSubstageSessionBriefs(ctx, id, 5)
		if err != nil {
			return err
		}
		return appresp.FailMsg(c, http.StatusConflict, "substage_has_sessions", stageUsageMessage("substage_has_sessions", n, briefs))
	}
	if err := h.repo.DeleteSubstage(ctx, id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// substageNameExists reports whether a Kegiatan name already exists under the
// Topik (case-insensitive app-level dedup; no schema change).
func (h *ProgramSubstageHandler) substageNameExists(ctx context.Context, programStageID, name string) (bool, error) {
	res, err := h.repo.ListPaginatedSubstages(ctx, repository.SubstageFilter{ProgramStageID: programStageID}, 1, 100)
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

// BadgeHandler serves /api/badges/* (read participant badges).
type BadgeHandler struct {
	substageRepo repository.SessionSubstageRepository
}

// NewBadgeHandler builds the badge handler.
func NewBadgeHandler(substageRepo repository.SessionSubstageRepository) *BadgeHandler {
	return &BadgeHandler{substageRepo: substageRepo}
}

// BadgeResponse is one GET /api/badges item: the awarded badge entity plus an
// always-present program_stage_id string ("" for FINAL badges, which are
// program-level and carry no Topik). The explicit field shadows the entity's
// omitempty pointer field, so clients always receive program_stage_id.
type BadgeResponse struct {
	*entity.ParticipantBadge
	ProgramStageID string `json:"program_stage_id"`
}

// List handles GET /api/badges?participant_id= (lists all badges for a participant).
func (h *BadgeHandler) List(c *echo.Context) error {
	participantID := (*c).QueryParam("participant_id")
	if participantID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	tenantID := appmiddleware.GetTenantID(c)
	items, err := h.substageRepo.ListBadgesByParticipant((*c).Request().Context(), participantID, tenantID)
	if err != nil {
		return err
	}
	resp := make([]BadgeResponse, 0, len(items))
	for i := range items {
		stageID := ""
		if items[i].ProgramStageID != nil {
			stageID = *items[i].ProgramStageID
		}
		resp = append(resp, BadgeResponse{ParticipantBadge: &items[i], ProgramStageID: stageID})
	}
	return appresp.OK(c, resp)
}

// SessionSubstageHandler serves the Live Monitor "Selesaikan Kegiatan" override at
// POST /api/session-substages/:id/complete (marks a Kegiatan leaf COMPLETED and
// re-runs per-child badge evaluation) and the facilitator-reachable read route
// GET /api/session-substages?session_id= (returns the Kegiatan leaves of a
// session).
type SessionSubstageHandler struct {
	badgeUC      *badgeuc.Usecase
	sessionUC    *usecase.SessionUsecase
	substageRepo repository.SessionSubstageRepository
	sessionRepo  repository.SessionRepository
}

// NewSessionSubstageHandler builds the session-substage handler.
func NewSessionSubstageHandler(badgeUC *badgeuc.Usecase, sessionUC *usecase.SessionUsecase, substageRepo repository.SessionSubstageRepository, sessionRepo repository.SessionRepository) *SessionSubstageHandler {
	return &SessionSubstageHandler{badgeUC: badgeUC, sessionUC: sessionUC, substageRepo: substageRepo, sessionRepo: sessionRepo}
}

// Complete handles POST /api/session-substages/:id/complete.
func (h *SessionSubstageHandler) Complete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.badgeUC.CompleteSessionSubstage((*c).Request().Context(), id, appmiddleware.GetTenantID(c)); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ListBySession handles GET /api/session-substages?session_id=: it returns the
// Kegiatan (session Kegiatan) leaves of a session. The caller must be in the
// session's tenant, and a FASILITATOR must own at least one group in it.
func (h *SessionSubstageHandler) ListBySession(c *echo.Context) error {
	sessionID := (*c).QueryParam("session_id")
	if sessionID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}

	ctx := (*c).Request().Context()

	// Tenant IDOR guard: the session must belong to the caller's tenant.
	tenantID := appmiddleware.GetTenantID(c)
	if tenantID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "tenant_required")
	}
	sessTenant, err := h.sessionRepo.TenantIDForSession(ctx, sessionID)
	if err != nil {
		return appresp.Fail(c, http.StatusNotFound, "session_not_found")
	}
	if sessTenant != tenantID {
		return appresp.Fail(c, http.StatusForbidden, "forbidden")
	}

	// Facilitator ownership gate: a FASILITATOR may only read a session where
	// they own at least one group. ADMIN/KOORDINATOR/SUPER_ADMIN bypass.
	if entity.UserRole(appmiddleware.GetRole(c)) == entity.RoleFasilitator {
		owns, oerr := h.sessionRepo.FacilitatorOwnsAnyGroup(ctx, sessionID, appmiddleware.GetUserID(c))
		if oerr != nil {
			return oerr
		}
		if !owns {
			return appresp.Fail(c, http.StatusForbidden, "not_group_owner")
		}
	}

	// Self-heal: ensure the Kegiatan leaves exist (idempotent). Failure is
	// non-fatal — fall through to listing whatever is present.
	if err := h.sessionUC.EnsureSessionSubstages(ctx, sessionID); err != nil {
		log.Printf("session-substages: ensure failed for %s: %v", sessionID, err)
	}

	items, err := h.substageRepo.ListSessionSubstages(ctx, sessionID)
	if err != nil {
		return err
	}
	return appresp.OK(c, items)
}
