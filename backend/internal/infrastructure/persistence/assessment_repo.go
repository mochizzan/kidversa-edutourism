package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormAssessmentRepository implements repository.AssessmentRepository.
type GormAssessmentRepository struct {
	db *gorm.DB
}

// NewAssessmentRepository builds a GORM-backed assessment repository.
func NewAssessmentRepository(db *gorm.DB) repository.AssessmentRepository {
	return &GormAssessmentRepository{db: db}
}

func (r *GormAssessmentRepository) Create(ctx context.Context, a *entity.Assessment) error {
	m := assessmentModelFromEntity(a)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*a = *m.ToEntity()
	return nil
}

func (r *GormAssessmentRepository) GetByID(ctx context.Context, id string) (*entity.Assessment, error) {
	var m AssessmentModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormAssessmentRepository) GetByParticipantStage(ctx context.Context, participantID, sessionStageID string) (*entity.Assessment, error) {
	var m AssessmentModel
	if err := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_stage_id = ?", participantID, sessionStageID).
		First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormAssessmentRepository) List(ctx context.Context, f repository.AssessmentFilter, page, limit int) (*repository.Paginated[entity.Assessment], error) {
	q := r.db.WithContext(ctx).Model(&AssessmentModel{})
	if f.ParticipantID != "" {
		q = q.Where("participant_id = ?", f.ParticipantID)
	}
	if f.SessionID != "" {
		q = q.Where("session_id = ?", f.SessionID)
	}
	if f.SessionStageID != "" {
		q = q.Where("session_stage_id = ?", f.SessionStageID)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	var models []AssessmentModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Assessment, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Assessment]{Items: items, Total: int(total)}, nil
}

func (r *GormAssessmentRepository) Update(ctx context.Context, a *entity.Assessment) error {
	m := assessmentModelFromEntity(a)
	if err := r.db.WithContext(ctx).Model(&AssessmentModel{}).Where("id = ?", a.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormAssessmentRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&AssessmentModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}
