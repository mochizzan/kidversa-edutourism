package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// TenantFilter narrows a tenant list query.
type TenantFilter struct {
	Search string
}

// TenantRepository is the persistence contract for tenants.
type TenantRepository interface {
	Create(ctx context.Context, t *entity.Tenant) error
	GetByID(ctx context.Context, id string) (*entity.Tenant, error)
	GetBySlug(ctx context.Context, slug string) (*entity.Tenant, error)
	List(ctx context.Context, f TenantFilter, page, limit int) (*Paginated[entity.Tenant], error)
	Update(ctx context.Context, t *entity.Tenant) error
	Delete(ctx context.Context, id string) error
}
