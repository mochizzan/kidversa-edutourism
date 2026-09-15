package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// GalleryTokenRepository manages gallery access tokens that enable public
// photo viewing via QR codes on printed rapors.
type GalleryTokenRepository interface {
	Create(ctx context.Context, t *entity.GalleryToken) error
	GetByToken(ctx context.Context, token string) (*entity.GalleryToken, error)
	GetByReportID(ctx context.Context, reportID string) (*entity.GalleryToken, error)
	RevokeByReportID(ctx context.Context, reportID string) error
	DeleteByReportID(ctx context.Context, reportID string) error
}
