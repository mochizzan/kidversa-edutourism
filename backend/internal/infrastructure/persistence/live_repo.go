package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormLiveRepository implements repository.LiveRepository on GORM.
type GormLiveRepository struct {
	db *gorm.DB
}

// NewLiveRepository builds a GORM-backed live repository.
func NewLiveRepository(db *gorm.DB) repository.LiveRepository {
	return &GormLiveRepository{db: db}
}

func (r *GormLiveRepository) GetProgressBySession(ctx context.Context, sessionID string) ([]entity.GroupStageProgress, error) {
	var models []GroupStageProgressModel
	if err := r.db.WithContext(ctx).Where("group_id IN (SELECT id FROM session_groups WHERE session_id = ?)", sessionID).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.GroupStageProgress, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

func (r *GormLiveRepository) GetProgressByGroup(ctx context.Context, groupID string) ([]entity.GroupStageProgress, error) {
	var models []GroupStageProgressModel
	if err := r.db.WithContext(ctx).Where("group_id = ?", groupID).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.GroupStageProgress, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

func (r *GormLiveRepository) UpsertProgress(ctx context.Context, p *entity.GroupStageProgress) error {
	m := groupStageProgressModelFromEntity(p)
	if err := r.db.WithContext(ctx).Where("group_id = ? AND session_stage_id = ?", p.GroupID, p.SessionStageID).
		Assign(m).FirstOrCreate(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*p = *m.ToEntity()
	return nil
}

func (r *GormLiveRepository) GetGroup(ctx context.Context, groupID string) (*entity.SessionGroup, error) {
	var m SessionGroupModel
	if err := r.db.WithContext(ctx).Where("id = ?", groupID).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormLiveRepository) ListGroups(ctx context.Context, sessionID string) ([]entity.SessionGroup, error) {
	var models []SessionGroupModel
	if err := r.db.WithContext(ctx).Where("session_id = ?", sessionID).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.SessionGroup, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

func (r *GormLiveRepository) UpdateGroup(ctx context.Context, g *entity.SessionGroup) error {
	m := sessionGroupModelFromEntity(g)
	if err := r.db.WithContext(ctx).Model(&SessionGroupModel{}).Where("id = ?", g.ID).Updates(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormLiveRepository) TenantIDForSession(ctx context.Context, sessionID string) (string, error) {
	var tid string
	if err := r.db.WithContext(ctx).Model(&SessionModel{}).Where("id = ?", sessionID).
		Pluck("tenant_id", &tid).Error; err != nil {
		return "", apperrors.Internal("internal_error", err)
	}
	return tid, nil
}

func (r *GormLiveRepository) ListTimeline(ctx context.Context, sessionID string, limit int) ([]entity.TimelineEvent, error) {
	var models []TimelineEventModel
	if limit <= 0 {
		limit = 100
	}
	if err := r.db.WithContext(ctx).Where("session_id = ?", sessionID).
		Order("created_at DESC").Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.TimelineEvent, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

func (r *GormLiveRepository) CreateTimeline(ctx context.Context, e *entity.TimelineEvent) error {
	m := timelineEventModelFromEntity(e)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*e = *m.ToEntity()
	return nil
}
