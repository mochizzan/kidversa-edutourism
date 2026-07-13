package handler

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// TenantHandler serves /api/tenants/* (SUPER_ADMIN only).
type TenantHandler struct {
	tenantUC *auth.TenantUsecase
	jwt      *auth.JWTManager
}

// NewTenantHandler builds the tenant handler.
func NewTenantHandler(tenantUC *auth.TenantUsecase, jwt *auth.JWTManager) *TenantHandler {
	return &TenantHandler{tenantUC: tenantUC, jwt: jwt}
}

func validateTenantID(c *echo.Context) (string, bool) {
	return bindUUID(c, "id")
}

// List handles GET /api/tenants.
func (h *TenantHandler) List(c *echo.Context) error {
	page, _ := strconv.Atoi((*c).QueryParam("page"))
	limit, _ := strconv.Atoi((*c).QueryParam("limit"))
	f := repository.TenantFilter{Search: (*c).QueryParam("search")}
	res, err := h.tenantUC.ListTenants((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, res.Items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// Create handles POST /api/tenants.
func (h *TenantHandler) Create(c *echo.Context) error {
	var req dto.CreateTenantRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	settings := parseSettingsJSON(req.SettingsJSON)
	t, err := h.tenantUC.CreateTenant((*c).Request().Context(), req.Name, req.Slug, settings)
	if err != nil {
		return err
	}
	return appresp.Created(c, t)
}

// Get handles GET /api/tenants/:id.
func (h *TenantHandler) Get(c *echo.Context) error {
	id, ok := validateTenantID(c)
	if !ok {
		return nil
	}
	t, err := h.tenantUC.GetTenant((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, t)
}

// Update handles PUT /api/tenants/:id.
func (h *TenantHandler) Update(c *echo.Context) error {
	id, ok := validateTenantID(c)
	if !ok {
		return nil
	}
	var req dto.UpdateTenantRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	settings := parseSettingsJSON(req.SettingsJSON)
	t, err := h.tenantUC.UpdateTenant((*c).Request().Context(), id, req.Name, req.Slug, settings)
	if err != nil {
		return err
	}
	return appresp.OK(c, t)
}

// Delete handles DELETE /api/tenants/:id.
func (h *TenantHandler) Delete(c *echo.Context) error {
	id, ok := validateTenantID(c)
	if !ok {
		return nil
	}
	if err := h.tenantUC.DeleteTenant((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// parseSettingsJSON converts a raw JSON string into entity.RawJSON, defaulting to {}.
func parseSettingsJSON(s string) []byte {
	if s == "" {
		return []byte("{}")
	}
	return []byte(s)
}
