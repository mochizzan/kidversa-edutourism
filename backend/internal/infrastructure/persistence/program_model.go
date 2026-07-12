package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ProgramModel is the GORM persistence model for programs.
type ProgramModel struct {
	entity.Program
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (ProgramModel) TableName() string { return "programs" }

// BeforeCreate generates a UUID if missing.
func (m *ProgramModel) BeforeCreate(*gorm.DB) error {
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
func (m *ProgramModel) ToEntity() *entity.Program {
	e := m.Program
	return &e
}

// programModelFromEntity builds a model from a domain entity.
func programModelFromEntity(e *entity.Program) *ProgramModel {
	return &ProgramModel{Program: *e}
}

// ProgramStageModel is the GORM persistence model for program stages.
type ProgramStageModel struct {
	entity.ProgramStage
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (ProgramStageModel) TableName() string { return "program_stages" }

// BeforeCreate generates a UUID if missing.
func (m *ProgramStageModel) BeforeCreate(*gorm.DB) error {
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
func (m *ProgramStageModel) ToEntity() *entity.ProgramStage {
	e := m.ProgramStage
	return &e
}

// programStageModelFromEntity builds a model from a domain entity.
func programStageModelFromEntity(e *entity.ProgramStage) *ProgramStageModel {
	return &ProgramStageModel{ProgramStage: *e}
}

// StageContentModel is the GORM persistence model for stage contents.
type StageContentModel struct {
	entity.StageContent
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (StageContentModel) TableName() string { return "stage_contents" }

// BeforeCreate generates a UUID if missing.
func (m *StageContentModel) BeforeCreate(*gorm.DB) error {
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
func (m *StageContentModel) ToEntity() *entity.StageContent {
	e := m.StageContent
	return &e
}

// stageContentModelFromEntity builds a model from a domain entity.
func stageContentModelFromEntity(e *entity.StageContent) *StageContentModel {
	return &StageContentModel{StageContent: *e}
}
