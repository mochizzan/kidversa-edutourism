package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormParticipantMissionRepository implements repository.ParticipantMissionRepository.
type GormParticipantMissionRepository struct {
	db *gorm.DB
}

// NewParticipantMissionRepository builds a GORM-backed participant-mission repo.
func NewParticipantMissionRepository(db *gorm.DB) repository.ParticipantMissionRepository {
	return &GormParticipantMissionRepository{db: db}
}

func (r *GormParticipantMissionRepository) Create(ctx context.Context, m *entity.ParticipantMission) error {
	mm := participantMissionModelFromEntity(m)
	if err := r.db.WithContext(ctx).Create(mm).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*m = *mm.ToEntity()
	return nil
}

func (r *GormParticipantMissionRepository) GetByID(ctx context.Context, id string) (*entity.ParticipantMission, error) {
	var m ParticipantMissionModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormParticipantMissionRepository) GetByReport(ctx context.Context, reportID string) ([]entity.ParticipantMission, error) {
	var models []ParticipantMissionModel
	if err := r.db.WithContext(ctx).Where("report_id = ?", reportID).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.ParticipantMission, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

func (r *GormParticipantMissionRepository) Update(ctx context.Context, m *entity.ParticipantMission) error {
	mm := participantMissionModelFromEntity(m)
	if err := r.db.WithContext(ctx).Model(&ParticipantMissionModel{}).Where("id = ?", m.ID).Updates(mm).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormParticipantMissionRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&ParticipantMissionModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// ReplaceByReport atomically replaces all participant missions for a report:
// deletes the existing rows and inserts the provided items within one transaction.
func (r *GormParticipantMissionRepository) ReplaceByReport(ctx context.Context, reportID string, items []entity.ParticipantMission) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("report_id = ?", reportID).Delete(&ParticipantMissionModel{}).Error; err != nil {
			return apperrors.Internal("internal_error", err)
		}
		if len(items) == 0 {
			return nil
		}
		models := make([]ParticipantMissionModel, 0, len(items))
		for i := range items {
			models = append(models, *participantMissionModelFromEntity(&items[i]))
		}
		if err := tx.Create(&models).Error; err != nil {
			if isDuplicate(err) {
				return apperrors.Conflict("conflict", err)
			}
			return apperrors.Internal("internal_error", err)
		}
		return nil
	})
}

// ListByParticipant returns all participant missions for the given participant.
func (r *GormParticipantMissionRepository) ListByParticipant(ctx context.Context, participantID string) ([]entity.ParticipantMission, error) {
	var models []ParticipantMissionModel
	if err := r.db.WithContext(ctx).Where("participant_id = ?", participantID).Order("created_at DESC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.ParticipantMission, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}
