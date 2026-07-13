package auth

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// TenantStats aggregates per-tenant usage counts for the SUPER_ADMIN view.
type TenantStats struct {
	UserCounts []repository.TenantUserCount
}

// TenantUsecase implements tenant administration (SUPER_ADMIN only).
type TenantUsecase struct {
	tenants repository.TenantRepository
}

// NewTenantUsecase builds the tenant administration usecase.
func NewTenantUsecase(tenants repository.TenantRepository) *TenantUsecase {
	return &TenantUsecase{tenants: tenants}
}

// CreateTenant creates a new tenant.
func (u *TenantUsecase) CreateTenant(ctx context.Context, name, slug string, settings []byte) (*entity.Tenant, error) {
	if name == "" || slug == "" {
		return nil, apperrors.BadRequest("validation_error", errors.New("name and slug are required"))
	}
	t := &entity.Tenant{
		BaseModel:    entity.BaseModel{ID: uuid.NewString()},
		Name:         name,
		Slug:         slug,
		SettingsJSON: settings,
	}
	if err := u.tenants.Create(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

// ListTenants returns a filtered, paginated tenant list.
func (u *TenantUsecase) ListTenants(ctx context.Context, f repository.TenantFilter, page, limit int) (*repository.Paginated[entity.Tenant], error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	return u.tenants.List(ctx, f, page, limit)
}

// GetTenant fetches a single tenant.
func (u *TenantUsecase) GetTenant(ctx context.Context, id string) (*entity.Tenant, error) {
	return u.tenants.GetByID(ctx, id)
}

// UpdateTenant updates mutable tenant fields.
func (u *TenantUsecase) UpdateTenant(ctx context.Context, id, name, slug string, settings []byte) (*entity.Tenant, error) {
	t, err := u.tenants.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if name != "" {
		t.Name = name
	}
	if slug != "" {
		t.Slug = slug
	}
	if settings != nil {
		t.SettingsJSON = settings
	}
	if err := u.tenants.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

// DeleteTenant removes a tenant.
func (u *TenantUsecase) DeleteTenant(ctx context.Context, id string) error {
	return u.tenants.Delete(ctx, id)
}

// GetStats returns aggregate counts across all tenants (SUPER_ADMIN only).
// User counts are computed server-side so the UI never needs a global /api/users
// fetch (which is tenant-scoped and would 400 without a selected tenant).
func (u *TenantUsecase) GetStats(ctx context.Context) (*TenantStats, error) {
	counts, err := u.tenants.CountUsers(ctx)
	if err != nil {
		return nil, err
	}
	return &TenantStats{UserCounts: counts}, nil
}
