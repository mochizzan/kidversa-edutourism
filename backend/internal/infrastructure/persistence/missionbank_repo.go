package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormMissionBankRepository implements repository.MissionBankRepository.
type GormMissionBankRepository struct {
	db *gorm.DB
}

// NewMissionBankRepository builds a GORM-backed mission-bank repository.
func NewMissionBankRepository(db *gorm.DB) repository.MissionBankRepository {
	return &GormMissionBankRepository{db: db}
}

func (r *GormMissionBankRepository) Create(ctx context.Context, m *entity.MissionBank) error {
	mm := missionBankModelFromEntity(m)
	if err := r.db.WithContext(ctx).Create(mm).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*m = *mm.ToEntity()
	return nil
}

func (r *GormMissionBankRepository) GetByID(ctx context.Context, id, tenantID string) (*entity.MissionBank, error) {
	var m MissionBankModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: mission_banks carry a stored tenant_id column.
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

func (r *GormMissionBankRepository) List(ctx context.Context, f repository.MissionBankFilter, page, limit int) (*repository.Paginated[entity.MissionBank], error) {
	q := r.db.WithContext(ctx).Model(&MissionBankModel{})
	if f.TenantID != "" {
		q = q.Where("tenant_id = ?", f.TenantID)
	}
	if f.ProgramID != "" {
		q = q.Where("program_id = ?", f.ProgramID)
	}
	if f.Category != "" {
		q = q.Where("category = ?", f.Category)
	}
	if f.IsActive != nil {
		q = q.Where("is_active = ?", *f.IsActive)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []MissionBankModel
	offset := (page - 1) * limit
	if err := q.Order("sort_order ASC, created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.MissionBank, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.MissionBank]{Items: items, Total: int(total)}, nil
}

func (r *GormMissionBankRepository) Update(ctx context.Context, m *entity.MissionBank) error {
	mm := missionBankModelFromEntity(m)
	if err := r.db.WithContext(ctx).Model(&MissionBankModel{}).Where("id = ?", m.ID).Updates(mm).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// UpdateFields applies a partial (map) update, so zero/false values persist (C2).
func (r *GormMissionBankRepository) UpdateFields(ctx context.Context, id string, fields map[string]interface{}) error {
	if err := r.db.WithContext(ctx).Model(&MissionBankModel{}).Where("id = ?", id).Updates(fields).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormMissionBankRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&MissionBankModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}
