package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// GalleryTokenModel is the GORM persistence model for GalleryToken.
type GalleryTokenModel struct {
	entity.GalleryToken
	DeletedAt gorm.DeletedAt `gorm:"column:deleted_at;type:datetime(3);index" json:"-"`
}

func (GalleryTokenModel) TableName() string { return "gallery_tokens" }

func (m *GalleryTokenModel) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	now := time.Now()
	if m.CreatedAt.IsZero() {
		m.CreatedAt = now
	}
	m.UpdatedAt = m.CreatedAt
	return nil
}

func (m *GalleryTokenModel) ToEntity() *entity.GalleryToken {
	e := m.GalleryToken
	return &e
}

func galleryTokenModelFromEntity(e *entity.GalleryToken) *GalleryTokenModel {
	return &GalleryTokenModel{GalleryToken: *e}
}
