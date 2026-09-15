package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormGalleryTokenRepository implements repository.GalleryTokenRepository.
type GormGalleryTokenRepository struct {
	db *gorm.DB
}

// NewGalleryTokenRepository builds a GORM-backed gallery token repository.
func NewGalleryTokenRepository(db *gorm.DB) repository.GalleryTokenRepository {
	return &GormGalleryTokenRepository{db: db}
}

func (r *GormGalleryTokenRepository) Create(ctx context.Context, t *entity.GalleryToken) error {
	m := galleryTokenModelFromEntity(t)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*t = *m.ToEntity()
	return nil
}

func (r *GormGalleryTokenRepository) GetByToken(ctx context.Context, token string) (*entity.GalleryToken, error) {
	var m GalleryTokenModel
	if err := r.db.WithContext(ctx).Where("token = ?", token).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("token_invalid", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormGalleryTokenRepository) GetByReportID(ctx context.Context, reportID string) (*entity.GalleryToken, error) {
	var m GalleryTokenModel
	if err := r.db.WithContext(ctx).Where("report_id = ?", reportID).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormGalleryTokenRepository) RevokeByReportID(ctx context.Context, reportID string) error {
	return r.db.WithContext(ctx).
		Model(&GalleryTokenModel{}).
		Where("report_id = ?", reportID).
		Update("revoked", true).Error
}

func (r *GormGalleryTokenRepository) DeleteByReportID(ctx context.Context, reportID string) error {
	return r.db.WithContext(ctx).
		Where("report_id = ?", reportID).
		Delete(&GalleryTokenModel{}).Error
}
