package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// TimelineEventModel is the GORM model for live timeline log entries.
type TimelineEventModel struct {
	entity.TimelineEvent
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (TimelineEventModel) TableName() string { return "timeline_events" }

// BeforeCreate generates a UUID if missing.
func (m *TimelineEventModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	m.UpdatedAt = m.CreatedAt
	return nil
}

// ToEntity maps the model back to the domain entity.
func (m *TimelineEventModel) ToEntity() *entity.TimelineEvent {
	e := m.TimelineEvent
	return &e
}

// timelineEventModelFromEntity builds a model from a domain entity.
func timelineEventModelFromEntity(e *entity.TimelineEvent) *TimelineEventModel {
	return &TimelineEventModel{TimelineEvent: *e}
}
