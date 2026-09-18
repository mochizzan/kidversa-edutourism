package handler

import (
	"log"
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
	badgeuc "kidversa-edutourism-backend/internal/usecase/badge"
)

// ProgramSubstageHandler serves /api/program-substages/* (CRUD over Kegiatan).
type ProgramSubstageHandler struct {
	repo repository.ProgramSubstageRepository
}

// NewProgramSubstageHandler builds the program-substage handler.
func NewProgramSubstageHandler(repo repository.ProgramSubstageRepository) *ProgramSubstageHandler {
	return &ProgramSubstageHandler{repo: repo}
}

// SubstageRequest is the create/update payload (Kegiatan leaf).
type SubstageRequest struct {
	ProgramStageID  string `json:"program_stage_id" validate:"required"`
	SequenceOrder int    `json:"sequence_order"`
	Name          string `json:"name" validate:"required"`
	Description   string `json:"description,omitempty"`
}

// Create handles POST /api/program-substages.
func (h *ProgramSubstageHandler) Create(c *echo.Context) error {
	var req SubstageRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	s := &entity.ProgramSubstage{
		ProgramStageID: req.ProgramStageID,
		SequenceOrder:  req.SequenceOrder,
		Name:           req.Name,
		Description:    req.Description,
	}
	if err := h.repo.CreateSubstage((*c).Request().Context(), s); err != nil {
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
	s, err := h.repo.GetSubstageByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, s)
}

// List handles GET /api/program-substages?program_stage_id=...&program_id=...&search=...&page=...&limit=...
func (h *ProgramSubstageHandler) List(c *echo.Context) error {
	programStageID := (*c).QueryParam("program_stage_id")
	programID := (*c).QueryParam("program_id")

	page, limit := pagination(c)
	f := repository.SubstageFilter{
		ProgramStageID: programStageID,
		ProgramID:      programID,
		Search:         (*c).QueryParam("search"),
	}
	res, err := h.repo.ListPaginatedSubstages((*c).Request().Context(), f, page, limit)
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
	s, err := h.repo.GetSubstageByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	var req SubstageRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	s.SequenceOrder = req.SequenceOrder
	s.Name = req.Name
	s.Description = req.Description
	if err := h.repo.UpdateSubstage((*c).Request().Context(), s); err != nil {
		return err
	}
	return appresp.OK(c, s)
}

// Delete handles DELETE /api/program-substages/:id.
func (h *ProgramSubstageHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.repo.DeleteSubstage((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// Reorder handles POST /api/program-substages/reorder.
func (h *ProgramSubstageHandler) Reorder(c *echo.Context) error {
	var req dto.ReorderRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	// programStageID is not required by the contract here; the ordering is
	// applied by id across the provided ordered list (ReorderSubstages ignores
	// it and renumbers by id). Pass empty to keep the interface uniform.
	if err := h.repo.ReorderSubstages((*c).Request().Context(), "", req.OrderedIDs); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// BadgeHandler serves /api/badges/* (read participant badges).
type BadgeHandler struct {
	substageRepo repository.SessionSubstageRepository
}

// NewBadgeHandler builds the badge handler.
func NewBadgeHandler(substageRepo repository.SessionSubstageRepository) *BadgeHandler {
	return &BadgeHandler{substageRepo: substageRepo}
}

// List handles GET /api/badges?participant_id= (lists all badges for a participant).
func (h *BadgeHandler) List(c *echo.Context) error {
	participantID := (*c).QueryParam("participant_id")
	if participantID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	items, err := h.substageRepo.ListBadgesByParticipant((*c).Request().Context(), participantID)
	if err != nil {
		return err
	}
	return appresp.OK(c, items)
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
