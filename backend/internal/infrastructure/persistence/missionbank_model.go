package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// MissionBankModel is the GORM persistence model for mission-bank templates.
type MissionBankModel struct {
	entity.MissionBank
	RelatedStageIDsJSON entity.RawJSON `gorm:"column:related_stage_ids" json:"related_stage_ids_json,omitempty"`
	CreatedAt           time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt           time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt           gorm.DeletedAt `gorm:"column:deleted_at;type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (MissionBankModel) TableName() string { return "mission_banks" }

// BeforeCreate generates a UUID if missing and stamps audit fields.
func (m *MissionBankModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	now := time.Now()
	if m.CreatedAt.IsZero() {
		m.CreatedAt = now
	}
	m.UpdatedAt = m.CreatedAt
	if m.IsActive {
		m.IsActive = true
	}
	return nil
}

// ToEntity maps the model back to the domain entity.
func (m *MissionBankModel) ToEntity() *entity.MissionBank {
	e := m.MissionBank
	return &e
}

// missionBankModelFromEntity builds a model from a domain entity.
func missionBankModelFromEntity(e *entity.MissionBank) *MissionBankModel {
	return &MissionBankModel{MissionBank: *e}
}
