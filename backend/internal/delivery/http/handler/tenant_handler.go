package handler

import (
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

// List handles GET /api/tenants.
func (h *TenantHandler) List(c *echo.Context) error {
	page, limit := pagination(c)
	f := repository.TenantFilter{Search: (*c).QueryParam("search")}
	res, err := h.tenantUC.ListTenants((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, res.Items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// Stats handles GET /api/tenants/stats. Returns per-tenant user counts for
// the SUPER_ADMIN tenant overview. No tenant scope is required because the
// caller is already gated to SUPER_ADMIN by the route middleware.
func (h *TenantHandler) Stats(c *echo.Context) error {
	stats, err := h.tenantUC.GetStats((*c).Request().Context())
	if err != nil {
		return err
	}
	return appresp.OK(c, stats)
}

// PublicList handles GET /api/public/tenants. It is intentionally
// unauthenticated so the anonymous registration form can populate its
// tenant selector. Only id/name/slug are projected (see dto.PublicTenantResponse)
// so no tenant configuration leaks to unauthenticated callers.
func (h *TenantHandler) PublicList(c *echo.Context) error {
	page, limit := pagination(c)
	f := repository.TenantFilter{Search: (*c).QueryParam("search")}
	res, err := h.tenantUC.ListTenants((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	items := make([]dto.PublicTenantResponse, 0, len(res.Items))
	for i := range res.Items {
		t := res.Items[i]
		items = append(items, dto.PublicTenantResponse{ID: t.ID, Name: t.Name, Slug: t.Slug})
	}
	return appresp.OKWithMeta(c, items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}
