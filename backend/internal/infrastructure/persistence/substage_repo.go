package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormProgramSubstageRepository implements repository.ProgramSubstageRepository.
type GormProgramSubstageRepository struct {
	db *gorm.DB
}

// NewProgramSubstageRepository builds a GORM-backed program-substage repository.
func NewProgramSubstageRepository(db *gorm.DB) repository.ProgramSubstageRepository {
	return &GormProgramSubstageRepository{db: db}
}

func (r *GormProgramSubstageRepository) CreateSubstage(ctx context.Context, s *entity.ProgramSubstage) error {
	m := programSubstageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*s = *m.ToEntity()
	return nil
}

func (r *GormProgramSubstageRepository) GetSubstageByID(ctx context.Context, id string) (*entity.ProgramSubstage, error) {
	var m ProgramSubstageModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormProgramSubstageRepository) ListSubstages(ctx context.Context, programStageID string) ([]entity.ProgramSubstage, error) {
	var models []ProgramSubstageModel
	if err := r.db.WithContext(ctx).
		Where("program_stage_id = ?", programStageID).
		Order("sequence_order ASC").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ProgramSubstage, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormProgramSubstageRepository) UpdateSubstage(ctx context.Context, s *entity.ProgramSubstage) error {
	m := programSubstageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Model(&ProgramSubstageModel{}).Where("id = ?", s.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormProgramSubstageRepository) DeleteSubstage(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&ProgramSubstageModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormProgramSubstageRepository) ReorderSubstages(ctx context.Context, _ string, orderedIDs []string) error {
	return InTx(ctx, r.db, func(tx *gorm.DB) error {
		return reorderByIDs(tx, &ProgramSubstageModel{}, orderedIDs, "id", "sequence_order")
	})
}

// GormSessionSubstageRepository implements repository.SessionSubstageRepository.
type GormSessionSubstageRepository struct {
	db *gorm.DB
}

// NewSessionSubstageRepository builds a GORM-backed session-substage repository.
func NewSessionSubstageRepository(db *gorm.DB) repository.SessionSubstageRepository {
	return &GormSessionSubstageRepository{db: db}
}

func (r *GormSessionSubstageRepository) CreateSessionSubstage(ctx context.Context, s *entity.SessionSubstage) error {
	m := sessionSubstageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*s = *m.ToEntity()
	return nil
}

func (r *GormSessionSubstageRepository) ListSessionSubstages(ctx context.Context, sessionID string) ([]entity.SessionSubstage, error) {
	var models []SessionSubstageModel
	if err := r.db.WithContext(ctx).
		Where("session_id = ?", sessionID).
		Order("created_at ASC").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.SessionSubstage, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionSubstageRepository) GetSessionSubstage(ctx context.Context, id string) (*entity.SessionSubstage, error) {
	var m SessionSubstageModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormSessionSubstageRepository) GetSessionSubstageByKeys(ctx context.Context, sessionID, programSubstageID string) (*entity.SessionSubstage, error) {
	var m SessionSubstageModel
	if err := r.db.WithContext(ctx).
		Where("session_id = ? AND program_substage_id = ?", sessionID, programSubstageID).
		First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormSessionSubstageRepository) UpdateSessionSubstage(ctx context.Context, s *entity.SessionSubstage) error {
	m := sessionSubstageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Model(&SessionSubstageModel{}).Where("id = ?", s.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormSessionSubstageRepository) CreateBadge(ctx context.Context, b *entity.ParticipantBadge) error {
	m := participantBadgeModelFromEntity(b)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*b = *m.ToEntity()
	return nil
}

func (r *GormSessionSubstageRepository) GetBadge(ctx context.Context, id string) (*entity.ParticipantBadge, error) {
	var m ParticipantBadgeModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormSessionSubstageRepository) ListBadgesByParticipant(ctx context.Context, participantID string) ([]entity.ParticipantBadge, error) {
	var models []ParticipantBadgeModel
	if err := r.db.WithContext(ctx).
		Where("participant_id = ?", participantID).
		Order("created_at ASC").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ParticipantBadge, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionSubstageRepository) ListBadgesByParticipantStage(ctx context.Context, participantID, programStageID string) ([]entity.ParticipantBadge, error) {
	var models []ParticipantBadgeModel
	if err := r.db.WithContext(ctx).
		Where("participant_id = ? AND program_stage_id = ? AND badge_type = ?", participantID, programStageID, entity.BadgeTypeSubtopik).
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ParticipantBadge, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionSubstageRepository) ListFinalBadgesByParticipant(ctx context.Context, participantID, programID string) ([]entity.ParticipantBadge, error) {
	var models []ParticipantBadgeModel
	if err := r.db.WithContext(ctx).
		Where("participant_id = ? AND program_id = ? AND badge_type = ?", participantID, programID, entity.BadgeTypeFinal).
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ParticipantBadge, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}
