package auth

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// TenantStats aggregates per-tenant usage counts for the SUPER_ADMIN view.
type TenantStats struct {
	UserCounts []repository.TenantUserCount `json:"user_counts"`
}

// TenantUsecase implements tenant administration (SUPER_ADMIN only).
type TenantUsecase struct {
	tenants repository.TenantRepository
}

// NewTenantUsecase builds the tenant administration usecase.
func NewTenantUsecase(tenants repository.TenantRepository) *TenantUsecase {
	return &TenantUsecase{tenants: tenants}
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
