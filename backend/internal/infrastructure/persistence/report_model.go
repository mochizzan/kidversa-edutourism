package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ReportModel is the GORM persistence model for reports.
type ReportModel struct {
	entity.Report
	CreatedAt time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"column:deleted_at;type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (ReportModel) TableName() string { return "reports" }

// BeforeCreate generates a UUID if missing and stamps audit fields.
func (m *ReportModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	now := time.Now()
	if m.CreatedAt.IsZero() {
		m.CreatedAt = now
	}
	m.UpdatedAt = m.CreatedAt
	if m.Status == "" {
		m.Status = entity.ReportDraft
	}
	return nil
}

// ToEntity maps the model back to the domain entity.
func (m *ReportModel) ToEntity() *entity.Report {
	e := m.Report
	return &e
}

// reportModelFromEntity builds a model from a domain entity.
func reportModelFromEntity(e *entity.Report) *ReportModel {
	return &ReportModel{Report: *e}
}
