package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// AssessmentModel is the GORM persistence model for assessments.
type AssessmentModel struct {
	entity.Assessment
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (AssessmentModel) TableName() string { return "assessments" }

// BeforeCreate generates a UUID if missing.
func (m *AssessmentModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	m.UpdatedAt = m.CreatedAt
	if m.SyncStatus == "" {
		m.SyncStatus = entity.SyncLocal
	}
	return nil
}

// ToEntity maps the model back to the domain entity.
func (m *AssessmentModel) ToEntity() *entity.Assessment {
	e := m.Assessment
	return &e
}

// assessmentModelFromEntity builds a model from a domain entity.
func assessmentModelFromEntity(e *entity.Assessment) *AssessmentModel {
	return &AssessmentModel{Assessment: *e}
}
