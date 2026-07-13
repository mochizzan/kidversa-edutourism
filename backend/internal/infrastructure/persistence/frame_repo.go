package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormFrameRepository implements repository.FrameRepository.
type GormFrameRepository struct {
	db *gorm.DB
}

// NewFrameRepository builds a GORM-backed photo-frame repository.
func NewFrameRepository(db *gorm.DB) repository.FrameRepository {
	return &GormFrameRepository{db: db}
}

func (r *GormFrameRepository) Create(ctx context.Context, f *entity.PhotoFrame) error {
	fm := photoFrameModelFromEntity(f)
	if err := r.db.WithContext(ctx).Create(fm).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*f = *fm.ToEntity()
	return nil
}

func (r *GormFrameRepository) GetByID(ctx context.Context, id, tenantID string) (*entity.PhotoFrame, error) {
	var m PhotoFrameModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: photo_frames carry a stored tenant_id column.
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormFrameRepository) List(ctx context.Context, f repository.FrameFilter, page, limit int) (*repository.Paginated[entity.PhotoFrame], error) {
	q := r.db.WithContext(ctx).Model(&PhotoFrameModel{})
	if f.TenantID != "" {
		q = q.Where("tenant_id = ?", f.TenantID)
	}
	if f.ProgramID != "" {
		q = q.Where("program_id = ?", f.ProgramID)
	}
	if f.IsActive != nil {
		q = q.Where("is_active = ?", *f.IsActive)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []PhotoFrameModel
	offset := (page - 1) * limit
	if err := q.Order("sort_order ASC, created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.PhotoFrame, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.PhotoFrame]{Items: items, Total: int(total)}, nil
}

func (r *GormFrameRepository) Update(ctx context.Context, f *entity.PhotoFrame) error {
	fm := photoFrameModelFromEntity(f)
	if err := r.db.WithContext(ctx).Model(&PhotoFrameModel{}).Where("id = ?", f.ID).Updates(fm).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// UpdateFields applies a partial (map) update, so zero/false values persist (C2).
func (r *GormFrameRepository) UpdateFields(ctx context.Context, id string, fields map[string]interface{}) error {
	if err := r.db.WithContext(ctx).Model(&PhotoFrameModel{}).Where("id = ?", id).Updates(fields).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormFrameRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&PhotoFrameModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}
