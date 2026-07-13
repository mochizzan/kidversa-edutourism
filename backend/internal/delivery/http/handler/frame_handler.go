package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// FrameHandler serves /api/frames/* (CRUD over decorative photo frames).
type FrameHandler struct {
	repo repository.FrameRepository
}

// NewFrameHandler builds the frame handler.
func NewFrameHandler(repo repository.FrameRepository) *FrameHandler {
	return &FrameHandler{repo: repo}
}

// Create handles POST /api/frames.
func (h *FrameHandler) Create(c *echo.Context) error {
	var req dto.FrameRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	// Tenant is derived from the JWT/scope (X-Tenant-Id honored only for
	// SUPER_ADMIN), never trusted from the request body (anti-forgery, F5).
	tenantID := appmiddleware.GetTenantID(c)
	f := &entity.PhotoFrame{
		TenantID:     tenantID,
		ProgramID:    req.ProgramID,
		Name:         req.Name,
		FileURL:      req.FileURL,
		ThumbnailURL: req.ThumbnailURL,
		IsActive:     req.IsActive,
		SortOrder:    req.SortOrder,
	}
	if err := h.repo.Create((*c).Request().Context(), f); err != nil {
		return err
	}
	return appresp.Created(c, dto.NewFrameResponse(f))
}

// GetByID handles GET /api/frames/:id.
func (h *FrameHandler) GetByID(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	f, err := h.repo.GetByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewFrameResponse(f))
}

// List handles GET /api/frames.
func (h *FrameHandler) List(c *echo.Context) error {
	// Tenant scope is read from the resolved context (X-Tenant-Id honored only for
	// SUPER_ADMIN), not from a forgeable query param (F5).
	f := repository.FrameFilter{TenantID: appmiddleware.GetTenantID(c), ProgramID: (*c).QueryParam("program_id")}
	if v := (*c).QueryParam("is_active"); v == "true" {
		t := true
		f.IsActive = &t
	} else if v == "false" {
		f2 := false
		f.IsActive = &f2
	}
	page, limit := pagination(c)
	res, err := h.repo.List((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, dto.NewFrameListResponse(res.Items), &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}
