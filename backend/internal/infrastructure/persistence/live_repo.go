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
	// The row is seeded as LOCKED when the session starts, so it almost always
	// already exists. FirstOrCreate+Assign does NOT persist Assign for the
	// found-existing case (it only updates in memory), so the status change
	// would be silently lost. Load by the natural key, create if absent, then
	// explicitly write the incoming progress fields.
	var existing GroupStageProgressModel
	err := r.db.WithContext(ctx).
		Where("group_id = ? AND session_stage_id = ?", p.GroupID, p.SessionStageID).
		First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if cerr := r.db.WithContext(ctx).Create(m).Error; cerr != nil {
			return apperrors.Internal("internal_error", cerr)
		}
		*p = *m.ToEntity()
		return nil
	}
	if err != nil {
		return apperrors.Internal("internal_error", err)
	}
	existing.Status = m.Status
	existing.UnlockedBy = m.UnlockedBy
	existing.UnlockReason = m.UnlockReason
	existing.CompletedAt = m.CompletedAt
	existing.EnteredAt = m.EnteredAt
	if uerr := r.db.WithContext(ctx).Save(&existing).Error; uerr != nil {
		return apperrors.Internal("internal_error", uerr)
	}
	*p = *existing.ToEntity()
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

func (r *GormLiveRepository) ListParticipants(ctx context.Context, sessionID, groupID string) ([]entity.Participant, error) {
	q := r.db.WithContext(ctx).Model(&ParticipantModel{})
	if sessionID != "" {
		q = q.Where("session_id = ?", sessionID)
	}
	if groupID != "" {
		q = q.Where("group_id = ?", groupID)
	}
	var models []ParticipantModel
	if err := q.Order("created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.Participant, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

func (r *GormLiveRepository) TenantIDForSession(ctx context.Context, sessionID string) (string, error) {
	var tid string
	if err := r.db.WithContext(ctx).Raw(
		"SELECT tenant_id FROM sessions WHERE id = ? AND deleted_at IS NULL LIMIT 1",
		sessionID,
	).Scan(&tid).Error; err != nil {
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
