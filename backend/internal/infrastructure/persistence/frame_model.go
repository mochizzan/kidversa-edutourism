package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// PhotoFrameModel is the GORM persistence model for decorative photo frames.
type PhotoFrameModel struct {
	entity.PhotoFrame
	CreatedAt time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"column:deleted_at;type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (PhotoFrameModel) TableName() string { return "photo_frames" }

// BeforeCreate generates a UUID if missing and stamps audit fields.
func (m *PhotoFrameModel) BeforeCreate(*gorm.DB) error {
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

// ToEntity maps the model back to the domain entity.
func (m *PhotoFrameModel) ToEntity() *entity.PhotoFrame {
	e := m.PhotoFrame
	return &e
}

// photoFrameModelFromEntity builds a model from a domain entity.
func photoFrameModelFromEntity(e *entity.PhotoFrame) *PhotoFrameModel {
	return &PhotoFrameModel{PhotoFrame: *e}
}
