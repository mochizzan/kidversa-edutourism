package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ProgramHandler serves /api/programs/* (SUPER_ADMIN, ADMIN, KOORDINATOR).
type ProgramHandler struct {
	repo repository.ProgramRepository
}

// NewProgramHandler builds the program handler.
func NewProgramHandler(repo repository.ProgramRepository) *ProgramHandler {
	return &ProgramHandler{repo: repo}
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

// Create handles POST /api/programs.
func (h *ProgramHandler) Create(c *echo.Context) error {
	var req dto.ProgramRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
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
	p := &entity.Program{Name: req.Name, Description: req.Description, ThumbnailURL: req.ThumbnailURL, IsActive: active, TenantID: tp}
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
	var req dto.ProgramRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if req.Name != "" {
		p.Name = req.Name
	}
	if req.Description != "" {
		p.Description = req.Description
	}
	if req.ThumbnailURL != "" {
		p.ThumbnailURL = req.ThumbnailURL
	}
	if req.IsActive != nil {
		p.IsActive = *req.IsActive
	}
	if err := h.repo.UpdateProgram((*c).Request().Context(), p); err != nil {
		return err
	}
	return appresp.OK(c, p)
}

// ToggleActive and Delete live in program_handler_extra.go.
