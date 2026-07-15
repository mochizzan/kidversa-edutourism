package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ParticipantMissionModel is the GORM persistence model for participant missions.
type ParticipantMissionModel struct {
	entity.ParticipantMission
	DeletedAt gorm.DeletedAt `gorm:"column:deleted_at;type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (ParticipantMissionModel) TableName() string { return "participant_missions" }

// BeforeCreate generates a UUID if missing and stamps audit fields.
func (m *ParticipantMissionModel) BeforeCreate(*gorm.DB) error {
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
func (m *ParticipantMissionModel) ToEntity() *entity.ParticipantMission {
	e := m.ParticipantMission
	return &e
}

// participantMissionModelFromEntity builds a model from a domain entity.
func participantMissionModelFromEntity(e *entity.ParticipantMission) *ParticipantMissionModel {
	return &ParticipantMissionModel{ParticipantMission: *e}
}
