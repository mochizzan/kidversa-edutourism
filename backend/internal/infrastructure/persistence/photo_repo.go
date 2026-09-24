package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

type GormPhotoRepository struct {
	db *gorm.DB
}

// NewPhotoRepository builds a GORM-backed photo repository.
func NewPhotoRepository(db *gorm.DB) repository.PhotoRepository {
	return &GormPhotoRepository{db: db}
}

func (r *GormPhotoRepository) CreatePhoto(ctx context.Context, p *entity.SmartPhoto) error {
	m := smartPhotoModelFromEntity(p)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*p = *m.ToEntity()
	return nil
}

func (r *GormPhotoRepository) GetPhotoByID(ctx context.Context, id, tenantID string) (*entity.SmartPhoto, error) {
	var m SmartPhotoModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: restrict to the photo's owning session's tenant (joined via
	// sessions) unless tenantID is empty (tenant-less SUPER_ADMIN).
	if tenantID != "" {
		q = q.Where("session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)", tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormPhotoRepository) UpdatePhoto(ctx context.Context, p *entity.SmartPhoto) error {
	m := smartPhotoModelFromEntity(p)
	if err := r.db.WithContext(ctx).Model(&SmartPhotoModel{}).Where("id = ?", p.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// UpdatePhotoFields applies a partial (map) update, so zero/false values persist (C2).
func (r *GormPhotoRepository) UpdatePhotoFields(ctx context.Context, id string, fields map[string]interface{}) error {
	if err := r.db.WithContext(ctx).Model(&SmartPhotoModel{}).Where("id = ?", id).Updates(fields).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// SetReportPhoto marks photoID as the exclusive is_report_photo for its
// participant+session scope, clearing the flag on all other photos in scope.
func (r *GormPhotoRepository) SetReportPhoto(ctx context.Context, participantID, sessionID, photoID string) error {
	if err := r.db.WithContext(ctx).
		Model(&SmartPhotoModel{}).
		Where("participant_id = ? AND session_id = ?", participantID, sessionID).
		Where("is_report_photo = ?", true).
		Update("is_report_photo", false).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	if err := r.db.WithContext(ctx).
		Model(&SmartPhotoModel{}).
		Where("id = ?", photoID).
		Update("is_report_photo", true).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormPhotoRepository) DeletePhoto(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&SmartPhotoModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// UpsertReportPhotoPick inserts or replaces the pick for one topic; the
// uq_photo_pick conflict on (participant, session, stage) updates photo_id.
func (r *GormPhotoRepository) UpsertReportPhotoPick(ctx context.Context, pick *entity.ReportPhotoPick) error {
	m := reportPhotoPickModelFromEntity(pick)
	if err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "participant_id"}, {Name: "session_id"}, {Name: "program_stage_id"},
			},
			DoUpdates: clause.AssignmentColumns([]string{"photo_id", "updated_at"}),
		}).
		Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*pick = *m.ToEntity()
	return nil
}

// GetReportPhotoPick returns (nil, nil) when no pick exists for the topic.
func (r *GormPhotoRepository) GetReportPhotoPick(ctx context.Context, participantID, sessionID, programStageID string) (*entity.ReportPhotoPick, error) {
	var m ReportPhotoPickModel
	err := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ? AND program_stage_id = ?", participantID, sessionID, programStageID).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

// ListReportPhotoPicks returns every pick for participant+session, ordered by program_stage_id.
func (r *GormPhotoRepository) ListReportPhotoPicks(ctx context.Context, participantID, sessionID string) ([]entity.ReportPhotoPick, error) {
	var models []ReportPhotoPickModel
	if err := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ?", participantID, sessionID).
		Order("program_stage_id").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	picks := make([]entity.ReportPhotoPick, 0, len(models))
	for i := range models {
		picks = append(picks, models[i].ReportPhotoPick)
	}
	return picks, nil
}

// DeleteReportPhotoPick removes the pick for one topic; a missing row is a no-op.
func (r *GormPhotoRepository) DeleteReportPhotoPick(ctx context.Context, participantID, sessionID, programStageID string) error {
	if err := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ? AND program_stage_id = ?", participantID, sessionID, programStageID).
		Delete(&ReportPhotoPickModel{}).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// ListPhotos returns photos matching the filter (paginated).
func (r *GormPhotoRepository) ListPhotos(ctx context.Context, f repository.PhotoFilter, page, limit int) (*repository.Paginated[entity.SmartPhoto], error) {
	q := r.db.WithContext(ctx).Model(&SmartPhotoModel{})
	if f.ParticipantID != "" {
		q = q.Where("participant_id = ?", f.ParticipantID)
	}
	if f.SessionID != "" {
		q = q.Where("session_id = ?", f.SessionID)
	}
	if f.FrameID != nil {
		q = q.Where("frame_id = ?", *f.FrameID)
	}
	if f.IsReportPhoto != nil {
		q = q.Where("is_report_photo = ?", *f.IsReportPhoto)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []SmartPhotoModel
	if err := paginate(q, page, limit, "created_at DESC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.SmartPhoto, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: items, Total: int(total)}, nil
}
