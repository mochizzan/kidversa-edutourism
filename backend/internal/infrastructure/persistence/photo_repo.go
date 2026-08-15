package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

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

// ListPhotos returns photos matching the filter (paginated).
func (r *GormPhotoRepository) ListPhotos(ctx context.Context, f repository.PhotoFilter, page, limit int) (*repository.Paginated[entity.SmartPhoto], error) {
	q := r.db.WithContext(ctx).Model(&SmartPhotoModel{})
	if f.ParticipantID != "" {
		q = q.Where("participant_id = ?", f.ParticipantID)
	}
	if f.SessionID != "" {
		q = q.Where("session_id = ?", f.SessionID)
	}
	if f.FrameID != "" {
		q = q.Where("frame_id = ?", f.FrameID)
	}
	if f.IsReportPhoto != nil {
		q = q.Where("is_report_photo = ?", *f.IsReportPhoto)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []SmartPhotoModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.SmartPhoto, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: items, Total: int(total)}, nil
}
