package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ProgramSubstageModel is the GORM persistence model for program substages.
type ProgramSubstageModel struct {
	entity.ProgramSubstage
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (ProgramSubstageModel) TableName() string { return "program_substages" }

// BeforeCreate generates a UUID if missing.
func (m *ProgramSubstageModel) BeforeCreate(*gorm.DB) error {
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
func (m *ProgramSubstageModel) ToEntity() *entity.ProgramSubstage {
	e := m.ProgramSubstage
	return &e
}

// programSubstageModelFromEntity builds a model from a domain entity.
func programSubstageModelFromEntity(e *entity.ProgramSubstage) *ProgramSubstageModel {
	return &ProgramSubstageModel{ProgramSubstage: *e}
}

// SessionSubstageModel is the GORM persistence model for session substages.
type SessionSubstageModel struct {
	entity.SessionSubstage
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (SessionSubstageModel) TableName() string { return "session_substages" }

// BeforeCreate generates a UUID if missing and defaults status to WAITING.
func (m *SessionSubstageModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	m.UpdatedAt = m.CreatedAt
	if m.Status == "" {
		m.Status = entity.SessionSubstageWaiting
	}
	return nil
}

// ToEntity maps the model back to the domain entity.
func (m *SessionSubstageModel) ToEntity() *entity.SessionSubstage {
	e := m.SessionSubstage
	return &e
}

// sessionSubstageModelFromEntity builds a model from a domain entity.
func sessionSubstageModelFromEntity(e *entity.SessionSubstage) *SessionSubstageModel {
	return &SessionSubstageModel{SessionSubstage: *e}
}

// ParticipantBadgeModel is the GORM persistence model for participant badges.
type ParticipantBadgeModel struct {
	entity.ParticipantBadge
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (ParticipantBadgeModel) TableName() string { return "participant_badges" }

// BeforeCreate generates a UUID if missing.
func (m *ParticipantBadgeModel) BeforeCreate(*gorm.DB) error {
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
func (m *ParticipantBadgeModel) ToEntity() *entity.ParticipantBadge {
	e := m.ParticipantBadge
	return &e
}

// participantBadgeModelFromEntity builds a model from a domain entity.
func participantBadgeModelFromEntity(e *entity.ParticipantBadge) *ParticipantBadgeModel {
	return &ParticipantBadgeModel{ParticipantBadge: *e}
}
