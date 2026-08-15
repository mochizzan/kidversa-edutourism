package handler

import (
	"log"
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ContentHandler serves the standalone /api/contents* CRUD + upload + usage.
type ContentHandler struct {
	cfg         *config.Config
	contentRepo repository.ContentRepository
}

// NewContentHandler builds the content handler.
func NewContentHandler(cfg *config.Config, contentRepo repository.ContentRepository) *ContentHandler {
	return &ContentHandler{cfg: cfg, contentRepo: contentRepo}
}

// List handles GET /api/contents (Manager list, tenant-scoped, search/type/page).
func (h *ContentHandler) List(c *echo.Context) error {
	tenantID := appmiddleware.GetTenantID(c)
	page, limit := pagination(c)
	f := repository.ContentFilter{
		TenantID: tenantID,
		Search:   (*c).QueryParam("search"),
		FileType: (*c).QueryParam("file_type"),
	}
	res, err := h.contentRepo.ListContents((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, res.Items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// Create handles POST /api/contents (JSON; supports YouTube url).
func (h *ContentHandler) Create(c *echo.Context) error {
	var req dto.ContentRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	tenantID := appmiddleware.GetTenantID(c)
	ct := &entity.Content{
		TenantID:        tenantID,
		Title:           req.Title,
		FileURL:         req.FileURL,
		YouTubeURL:      req.YouTubeURL,
		FileType:        req.FileType,
		DurationSeconds: req.DurationSeconds,
	}
	if err := h.contentRepo.CreateContent((*c).Request().Context(), ct); err != nil {
		return err
	}
	return appresp.Created(c, ct)
}

// Get handles GET /api/contents/:id.
func (h *ContentHandler) Get(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ct, err := h.contentRepo.GetContentByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, ct)
}

// Update handles PUT /api/contents/:id (global fields only, E2).
func (h *ContentHandler) Update(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ct, err := h.contentRepo.GetContentByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	var req dto.ContentRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if req.Title != "" {
		ct.Title = req.Title
	}
	if req.FileURL != "" {
		ct.FileURL = req.FileURL
	}
	ct.YouTubeURL = req.YouTubeURL
	if req.FileType != "" {
		ct.FileType = req.FileType
	}
	ct.DurationSeconds = req.DurationSeconds
	if err := h.contentRepo.UpdateContent((*c).Request().Context(), ct); err != nil {
		return err
	}
	return appresp.OK(c, ct)
}

// Delete handles DELETE /api/contents/:id (D10a atomic via repo; removes file).
func (h *ContentHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	fileURL, err := h.contentRepo.DeleteContent((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	// E24: remove the orphaned stored file (YouTube contents have empty file_url).
	if fileURL != "" {
		if rmErr := removeStored(h.cfg.UploadDir, fileURL); rmErr != nil {
			log.Printf("content: failed to remove orphan file %s: %v", fileURL, rmErr)
		}
	}
	return appresp.NoContent(c)
}

// Usage handles GET /api/contents/:id/usage (confirm dialog — A3a).
func (h *ContentHandler) Usage(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	usage, err := h.contentRepo.GetContentUsage((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, usage)
}
