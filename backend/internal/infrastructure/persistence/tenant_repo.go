package persistence

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormTenantRepository implements repository.TenantRepository.
type GormTenantRepository struct {
	db *gorm.DB
}

// NewTenantRepository builds a GORM-backed tenant repository.
func NewTenantRepository(db *gorm.DB) repository.TenantRepository {
	return &GormTenantRepository{db: db}
}

func (r *GormTenantRepository) Create(ctx context.Context, t *entity.Tenant) error {
	m := tenantModelFromEntity(t)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*t = *m.ToEntity()
	return nil
}

func (r *GormTenantRepository) GetByID(ctx context.Context, id string) (*entity.Tenant, error) {
	var m TenantModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormTenantRepository) GetBySlug(ctx context.Context, slug string) (*entity.Tenant, error) {
	var m TenantModel
	if err := r.db.WithContext(ctx).Where("slug = ?", strings.ToLower(slug)).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormTenantRepository) List(ctx context.Context, f repository.TenantFilter, page, limit int) (*repository.Paginated[entity.Tenant], error) {
	q := r.db.WithContext(ctx).Model(&TenantModel{})
	if f.Search != "" {
		like := "%" + strings.ToLower(f.Search) + "%"
		q = q.Where("LOWER(name) LIKE ? OR LOWER(slug) LIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	var models []TenantModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Tenant, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Tenant]{Items: items, Total: int(total)}, nil
}

func (r *GormTenantRepository) Update(ctx context.Context, t *entity.Tenant) error {
	m := tenantModelFromEntity(t)
	if err := r.db.WithContext(ctx).Model(&TenantModel{}).Where("id = ?", t.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormTenantRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&TenantModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// CountUsers groups users by tenant_id and returns the count per tenant.
// Tenants with zero users are omitted (the frontend defaults missing to 0),
// and platform-level (tenant-less) users are excluded from the per-tenant view.
func (r *GormTenantRepository) CountUsers(ctx context.Context) ([]repository.TenantUserCount, error) {
	var rows []struct {
		TenantID string `gorm:"column:tenant_id"`
		Count     int    `gorm:"column:cnt"`
	}
	if err := r.db.WithContext(ctx).
		Model(&UserModel{}).
		Select("tenant_id, COUNT(*) AS cnt").
		Where("tenant_id IS NOT NULL AND tenant_id <> ?", "").
		Group("tenant_id").
		Scan(&rows).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]repository.TenantUserCount, 0, len(rows))
	for _, row := range rows {
		out = append(out, repository.TenantUserCount{TenantID: row.TenantID, Count: row.Count})
	}
	return out, nil
}
