package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// SmartPhotoModel is the GORM persistence model for photos.
type SmartPhotoModel struct {
	entity.SmartPhoto
	DeletedAt gorm.DeletedAt `gorm:"column:deleted_at;type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (SmartPhotoModel) TableName() string { return "smart_photos" }

// BeforeCreate generates a UUID if missing and stamps audit fields.
func (m *SmartPhotoModel) BeforeCreate(*gorm.DB) error {
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
func (m *SmartPhotoModel) ToEntity() *entity.SmartPhoto {
	e := m.SmartPhoto
	return &e
}

// smartPhotoModelFromEntity builds a model from a domain entity.
func smartPhotoModelFromEntity(e *entity.SmartPhoto) *SmartPhotoModel {
	return &SmartPhotoModel{SmartPhoto: *e}
}

// RecordingModel is the GORM persistence model for recordings.
type RecordingModel struct {
	entity.Recording
	DeletedAt gorm.DeletedAt `gorm:"column:deleted_at;type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (RecordingModel) TableName() string { return "recordings" }

// BeforeCreate generates a UUID if missing and stamps audit fields.
func (m *RecordingModel) BeforeCreate(*gorm.DB) error {
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
func (m *RecordingModel) ToEntity() *entity.Recording {
	e := m.Recording
	return &e
}

// recordingModelFromEntity builds a model from a domain entity.
func recordingModelFromEntity(e *entity.Recording) *RecordingModel {
	return &RecordingModel{Recording: *e}
}

// ConsentLogModel is the GORM persistence model for consent logs.
type ConsentLogModel struct {
	entity.ConsentLog
	DeletedAt gorm.DeletedAt `gorm:"column:deleted_at;type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (ConsentLogModel) TableName() string { return "consent_logs" }

// BeforeCreate generates a UUID if missing and stamps audit fields.
// Without this hook, Create/SendRequest would persist with an empty id and
// trip the PRIMARY KEY (duplicate ” entry).
func (m *ConsentLogModel) BeforeCreate(*gorm.DB) error {
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
func (m *ConsentLogModel) ToEntity() *entity.ConsentLog {
	e := m.ConsentLog
	return &e
}
