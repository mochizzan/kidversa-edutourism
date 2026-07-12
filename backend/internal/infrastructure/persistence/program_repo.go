package persistence

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// GormProgramRepository implements repository.ProgramRepository.
type GormProgramRepository struct {
	db *gorm.DB
}

// NewProgramRepository builds a GORM-backed program repository.
func NewProgramRepository(db *gorm.DB) repository.ProgramRepository {
	return &GormProgramRepository{db: db}
}

// --- Programs ---

func (r *GormProgramRepository) CreateProgram(ctx context.Context, p *entity.Program) error {
	m := programModelFromEntity(p)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*p = *m.ToEntity()
	return nil
}

func (r *GormProgramRepository) GetProgramByID(ctx context.Context, id string) (*entity.Program, error) {
	var m ProgramModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormProgramRepository) ListPrograms(ctx context.Context, f repository.ProgramFilter, page, limit int) (*repository.Paginated[entity.Program], error) {
	q := r.db.WithContext(ctx).Model(&ProgramModel{})
	if f.TenantID != "" {
		q = q.Where("tenant_id = ?", f.TenantID)
	}
	if f.IsActive != nil {
		q = q.Where("is_active = ?", *f.IsActive)
	}
	if f.Search != "" {
		like := "%" + strings.ToLower(f.Search) + "%"
		q = q.Where("LOWER(name) LIKE ? OR LOWER(description) LIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	var models []ProgramModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Program, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Program]{Items: items, Total: int(total)}, nil
}

func (r *GormProgramRepository) UpdateProgram(ctx context.Context, p *entity.Program) error {
	m := programModelFromEntity(p)
	if err := r.db.WithContext(ctx).Model(&ProgramModel{}).Where("id = ?", p.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormProgramRepository) DeleteProgram(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&ProgramModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormProgramRepository) ToggleActiveProgram(ctx context.Context, id string) (*entity.Program, error) {
	var m ProgramModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	m.IsActive = !m.IsActive
	if err := r.db.WithContext(ctx).Model(&ProgramModel{}).Where("id = ?", id).Update("is_active", m.IsActive).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

// --- Stages ---

func (r *GormProgramRepository) CreateStage(ctx context.Context, s *entity.ProgramStage) error {
	m := programStageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*s = *m.ToEntity()
	return nil
}

func (r *GormProgramRepository) GetStageByID(ctx context.Context, id string) (*entity.ProgramStage, error) {
	var m ProgramStageModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormProgramRepository) ListStages(ctx context.Context, programID string) ([]entity.ProgramStage, error) {
	var models []ProgramStageModel
	if err := r.db.WithContext(ctx).Where("program_id = ?", programID).Order("sequence_order ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ProgramStage, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormProgramRepository) UpdateStage(ctx context.Context, s *entity.ProgramStage) error {
	m := programStageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Model(&ProgramStageModel{}).Where("id = ?", s.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormProgramRepository) DeleteStage(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&ProgramStageModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormProgramRepository) ReorderStages(ctx context.Context, _ string, orderedIDs []string) error {
	return r.reorder(ctx, &ProgramStageModel{}, "sequence_order", orderedIDs)
}

// --- Contents ---

func (r *GormProgramRepository) CreateContent(ctx context.Context, c *entity.StageContent) error {
	m := stageContentModelFromEntity(c)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*c = *m.ToEntity()
	return nil
}

func (r *GormProgramRepository) GetContentByID(ctx context.Context, id string) (*entity.StageContent, error) {
	var m StageContentModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormProgramRepository) ListContents(ctx context.Context, stageID string) ([]entity.StageContent, error) {
	var models []StageContentModel
	if err := r.db.WithContext(ctx).Where("program_stage_id = ?", stageID).Order("sort_order ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.StageContent, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormProgramRepository) UpdateContent(ctx context.Context, c *entity.StageContent) error {
	m := stageContentModelFromEntity(c)
	if err := r.db.WithContext(ctx).Model(&StageContentModel{}).Where("id = ?", c.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormProgramRepository) DeleteContent(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&StageContentModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormProgramRepository) ReorderContents(ctx context.Context, _ string, orderedIDs []string) error {
	return r.reorder(ctx, &StageContentModel{}, "sort_order", orderedIDs)
}

// reorder updates the ordering column of rows to match orderedIDs (1-based sequence).
func (r *GormProgramRepository) reorder(ctx context.Context, model interface{}, column string, orderedIDs []string) error {
	tx := r.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return apperrors.Internal("internal_error", tx.Error)
	}
	for i, id := range orderedIDs {
		if err := tx.Model(model).Where("id = ?", id).Update(column, i+1).Error; err != nil {
			tx.Rollback()
			return apperrors.Internal("internal_error", err)
		}
	}
	if err := tx.Commit().Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}
