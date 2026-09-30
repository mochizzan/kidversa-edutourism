package handler

import (
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
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
