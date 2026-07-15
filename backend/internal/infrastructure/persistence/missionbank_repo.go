package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// loadRelatedStages fills each mission bank's RelatedStageIDs from the
// mission_bank_stages junction table, preserving the stored sort order.
func (r *GormMissionBankRepository) loadRelatedStages(ctx context.Context, banks []entity.MissionBank) error {
	if len(banks) == 0 {
		return nil
	}
	ids := make([]string, 0, len(banks))
	for i := range banks {
		ids = append(ids, banks[i].ID)
	}
	var rows []MissionBankStageModel
	if err := r.db.WithContext(ctx).Where("mission_bank_id IN ?", ids).Order("sort_order ASC").Find(&rows).Error; err != nil {
		return err
	}
	byBank := make(map[string][]string, len(banks))
	for _, row := range rows {
		byBank[row.MissionBankID] = append(byBank[row.MissionBankID], row.ProgramStageID)
	}
	for i := range banks {
		banks[i].RelatedStageIDs = byBank[banks[i].ID]
	}
	return nil
}

// saveRelatedStages replaces the junction rows for one mission bank (ON DELETE
// CASCADE on the FK removes the old rows when the bank is deleted, but for
// update we delete-then-insert within the same call).
func (r *GormMissionBankRepository) saveRelatedStages(ctx context.Context, bankID string, stageIDs []string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("mission_bank_id = ?", bankID).Delete(&MissionBankStageModel{}).Error; err != nil {
			return err
		}
		if len(stageIDs) == 0 {
			return nil
		}
		rows := make([]MissionBankStageModel, 0, len(stageIDs))
		for i, sid := range stageIDs {
			rows = append(rows, MissionBankStageModel{
				MissionBankID:  bankID,
				ProgramStageID: sid,
				SortOrder:      i,
			})
		}
		return tx.Create(&rows).Error
	})
}

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
	if err := r.saveRelatedStages(ctx, m.ID, m.RelatedStageIDs); err != nil {
		return apperrors.Internal("internal_error", err)
	}
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
	e := m.ToEntity()
	banks := []entity.MissionBank{*e}
	if err := r.loadRelatedStages(ctx, banks); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	*e = banks[0]
	return e, nil
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
	if err := r.loadRelatedStages(ctx, items); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return &repository.Paginated[entity.MissionBank]{Items: items, Total: int(total)}, nil
}

func (r *GormMissionBankRepository) Update(ctx context.Context, m *entity.MissionBank) error {
	mm := missionBankModelFromEntity(m)
	if err := r.db.WithContext(ctx).Model(&MissionBankModel{}).Where("id = ?", m.ID).Updates(mm).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	if err := r.saveRelatedStages(ctx, m.ID, m.RelatedStageIDs); err != nil {
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
