package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ProgramHandler serves /api/programs/* (SUPER_ADMIN, ADMIN, KOORDINATOR).
type ProgramHandler struct {
	repo         repository.ProgramRepository
	contentRepo  repository.ContentRepository
	substageRepo repository.ProgramSubstageRepository
}

// NewProgramHandler builds the program handler. It owns the substage-scoped
// content ops (list/assign/unassign/reorder) via the shared ContentRepository
// (CRIT-5). substageRepo guards Kegiatan existence and resolves tenant scope.
func NewProgramHandler(repo repository.ProgramRepository, contentRepo repository.ContentRepository, substageRepo repository.ProgramSubstageRepository) *ProgramHandler {
	return &ProgramHandler{repo: repo, contentRepo: contentRepo, substageRepo: substageRepo}
}

// List handles GET /api/programs (paginated; ?search=, ?is_active=).
func (h *ProgramHandler) List(c *echo.Context) error {
	tenantID := appmiddleware.GetTenantID(c)
	page, limit := pagination(c)
	f := repository.ProgramFilter{Search: (*c).QueryParam("search")}
	if tenantID != "" {
		f.TenantID = tenantID
	}
	if v := (*c).QueryParam("is_active"); v == "true" || v == "false" {
		b := v == "true"
		f.IsActive = &b
	}
	res, err := h.repo.ListPrograms((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, res.Items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// bindAndValidateStrict is a Program-scoped strict binder. It decodes the JSON
// body with DisallowUnknownFields() so legacy payloads containing removed fields
// (e.g. thumbnail_url) are rejected with 400 invalid_body before reaching the
// repository. It then runs the standard validator (400 validation_error on
// failure). This does NOT replace the shared bindAndValidate used by other endpoints.
func bindAndValidateStrict(c *echo.Context, req interface{}) error {
	decoder := json.NewDecoder((*c).Request().Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(req); err != nil {
		return apperrors.BadRequest("invalid_body", err)
	}
	if err := (*c).Validate(req); err != nil {
		return apperrors.BadRequest("validation_error", err)
	}
	return nil
}

// Create handles POST /api/programs.
func (h *ProgramHandler) Create(c *echo.Context) error {
	var req dto.ProgramRequest
	if err := bindAndValidateStrict(c, &req); err != nil {
		return err
	}
	if strings.TrimSpace(derefString(req.Name)) == "" {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	active := true
	if req.IsActive != nil {
		active = *req.IsActive
	}
	tenantID := appmiddleware.GetTenantID(c)
	var tp *string
	if tenantID != "" {
		tp = &tenantID
	}
	p := &entity.Program{
		Name:               derefString(req.Name),
		Description:        derefString(req.Description),
		FinalBadgeName:     derefString(req.FinalBadgeName),
		FinalBadgeImageURL: derefString(req.FinalBadgeImageURL),
		IsActive:           active,
		TenantID:           tp,
	}
	if err := h.repo.CreateProgram((*c).Request().Context(), p); err != nil {
		return err
	}
	return appresp.Created(c, p)
}

// Get handles GET /api/programs/:id.
func (h *ProgramHandler) Get(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	p, err := h.repo.GetProgramByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, p)
}

// Update handles PUT /api/programs/:id.
func (h *ProgramHandler) Update(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	p, err := h.repo.GetProgramByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	// Enforce tenant isolation on the write path (mirrors media_handler.go:169).
	if caller := appmiddleware.GetTenantID(c); caller != "" && derefTenant(p.TenantID) != caller {
		return appresp.Fail(c, http.StatusForbidden, "forbidden")
	}
	var req dto.ProgramRequest
	if err := bindAndValidateStrict(c, &req); err != nil {
		return err
	}
	if req.Name != nil {
		if strings.TrimSpace(*req.Name) == "" {
			return appresp.Fail(c, http.StatusBadRequest, "validation_error")
		}
		p.Name = *req.Name
	}
	if req.Description != nil {
		p.Description = *req.Description
	}
	if req.IsActive != nil {
		p.IsActive = *req.IsActive
	}
	if req.FinalBadgeName != nil {
		p.FinalBadgeName = *req.FinalBadgeName
	}
	if req.FinalBadgeImageURL != nil {
		p.FinalBadgeImageURL = *req.FinalBadgeImageURL
	}
	if err := h.repo.UpdateProgram((*c).Request().Context(), p); err != nil {
		return err
	}
	// Return the persisted row so the response matches the DB (fixes the
	// is_active=false 'lies' bug where the in-memory object was returned).
	p, err = h.repo.GetProgramByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, p)
}

// ToggleActive and Delete live in program_handler_extra.go.
