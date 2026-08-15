package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

type GormRecordingRepository struct {
	db *gorm.DB
}

// NewRecordingRepository builds a GORM-backed recording repository.
func NewRecordingRepository(db *gorm.DB) repository.RecordingRepository {
	return &GormRecordingRepository{db: db}
}

func (r *GormRecordingRepository) loadEmotionTags(ctx context.Context, recordings []entity.Recording) error {
	if len(recordings) == 0 {
		return nil
	}
	ids := make([]string, 0, len(recordings))
	for i := range recordings {
		ids = append(ids, recordings[i].ID)
	}
	var rows []RecordingEmotionTagModel
	if err := r.db.WithContext(ctx).Where("recording_id IN ?", ids).Find(&rows).Error; err != nil {
		return err
	}
	byRec := make(map[string][]string, len(recordings))
	for _, row := range rows {
		byRec[row.RecordingID] = append(byRec[row.RecordingID], row.EmotionTag)
	}
	for i := range recordings {
		recordings[i].EmotionTags = byRec[recordings[i].ID]
	}
	return nil
}

func (r *GormRecordingRepository) saveEmotionTags(ctx context.Context, recordingID string, tags []string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("recording_id = ?", recordingID).Delete(&RecordingEmotionTagModel{}).Error; err != nil {
			return err
		}
		if len(tags) == 0 {
			return nil
		}
		rows := make([]RecordingEmotionTagModel, 0, len(tags))
		for _, tag := range tags {
			rows = append(rows, RecordingEmotionTagModel{RecordingID: recordingID, EmotionTag: tag})
		}
		return tx.Create(&rows).Error
	})
}

func (r *GormRecordingRepository) CreateRecording(ctx context.Context, rec *entity.Recording) error {
	m := recordingModelFromEntity(rec)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*rec = *m.ToEntity()
	if err := r.saveEmotionTags(ctx, rec.ID, rec.EmotionTags); err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormRecordingRepository) GetRecordingByID(ctx context.Context, id, tenantID string) (*entity.Recording, error) {
	var m RecordingModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: restrict to the recording's owning session's tenant (joined
	// via sessions) unless tenantID is empty (tenant-less SUPER_ADMIN).
	if tenantID != "" {
		q = q.Where("session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)", tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	e := m.ToEntity()
	recs := []entity.Recording{*e}
	if err := r.loadEmotionTags(ctx, recs); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	*e = recs[0]
	return e, nil
}

func (r *GormRecordingRepository) UpdateRecording(ctx context.Context, rec *entity.Recording) error {
	m := recordingModelFromEntity(rec)
	if err := r.db.WithContext(ctx).Model(&RecordingModel{}).Where("id = ?", rec.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	if err := r.saveEmotionTags(ctx, rec.ID, rec.EmotionTags); err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// UpdateRecordingFields applies a partial (map) update, so zero/false values persist (C2).
func (r *GormRecordingRepository) UpdateRecordingFields(ctx context.Context, id string, fields map[string]interface{}) error {
	if err := r.db.WithContext(ctx).Model(&RecordingModel{}).Where("id = ?", id).Updates(fields).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormRecordingRepository) DeleteRecording(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&RecordingModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// ListRecordings returns recordings matching the filter (paginated).
func (r *GormRecordingRepository) ListRecordings(ctx context.Context, f repository.RecordingFilter, page, limit int) (*repository.Paginated[entity.Recording], error) {
	q := r.db.WithContext(ctx).Model(&RecordingModel{})
	if f.ParticipantID != "" {
		q = q.Where("participant_id = ?", f.ParticipantID)
	}
	if f.SessionID != "" {
		q = q.Where("session_id = ?", f.SessionID)
	}
	if f.SessionStageID != "" {
		q = q.Where("session_stage_id = ?", f.SessionStageID)
	}
	if f.ReviewStatus != "" {
		q = q.Where("review_status = ?", f.ReviewStatus)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []RecordingModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Recording, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	if err := r.loadEmotionTags(ctx, items); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return &repository.Paginated[entity.Recording]{Items: items, Total: int(total)}, nil
}
