package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// TenantFilter narrows a tenant list query.
type TenantFilter struct {
	Search string
}

// TenantUserCount is the per-tenant user count returned by CountUsers.
type TenantUserCount struct {
	TenantID string `json:"tenant_id"`
	Count    int    `json:"count"`
}

// TenantRepository is the persistence contract for tenants.
type TenantRepository interface {
	GetBySlug(ctx context.Context, slug string) (*entity.Tenant, error)
	List(ctx context.Context, f TenantFilter, page, limit int) (*Paginated[entity.Tenant], error)
	// CountUsers returns the number of users per tenant (only tenants that have
	// at least one user are included). Used by the SUPER_ADMIN tenant stats view.
	CountUsers(ctx context.Context) ([]TenantUserCount, error)
}
