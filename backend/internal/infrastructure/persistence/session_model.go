package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// sessionDateLayout is the MariaDB DATE format (YYYY-MM-DD). Used to
// normalize the SessionDate round-trip: the go-sql-driver reads DATE
// columns as RFC3339 strings when parseTime=true; we reformat on read
// and write so MySQL always receives a valid DATE literal.
const sessionDateLayout = "2006-01-02"

// SessionModel is the GORM persistence model for sessions.
type SessionModel struct {
	entity.Session
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (SessionModel) TableName() string { return "sessions" }

// BeforeCreate generates a UUID if missing.
func (m *SessionModel) BeforeCreate(*gorm.DB) error {
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
func (m *SessionModel) ToEntity() *entity.Session {
	e := m.Session
	if t, err := time.Parse(time.RFC3339, e.SessionDate); err == nil {
		e.SessionDate = t.Format(sessionDateLayout)
	}
	return &e
}

func sessionModelFromEntity(e *entity.Session) *SessionModel {
	m := &SessionModel{Session: *e}
	if t, err := time.Parse(time.RFC3339, m.SessionDate); err == nil {
		m.SessionDate = t.Format(sessionDateLayout)
	}
	return m
}

// SessionStageModel is the GORM persistence model for session stages.
type SessionStageModel struct {
	entity.SessionStage
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

func (SessionStageModel) TableName() string { return "session_stages" }

func (m *SessionStageModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	m.UpdatedAt = m.CreatedAt
	return nil
}

func (m *SessionStageModel) ToEntity() *entity.SessionStage {
	e := m.SessionStage
	return &e
}

func sessionStageModelFromEntity(e *entity.SessionStage) *SessionStageModel {
	return &SessionStageModel{SessionStage: *e}
}

// SessionGroupModel is the GORM persistence model for session groups.
type SessionGroupModel struct {
	entity.SessionGroup
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

func (SessionGroupModel) TableName() string { return "session_groups" }

func (m *SessionGroupModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	m.UpdatedAt = m.CreatedAt
	return nil
}

func (m *SessionGroupModel) ToEntity() *entity.SessionGroup {
	e := m.SessionGroup
	return &e
}

func sessionGroupModelFromEntity(e *entity.SessionGroup) *SessionGroupModel {
	return &SessionGroupModel{SessionGroup: *e}
}

// GroupStageProgressModel is the GORM persistence model for group-stage progress.
type GroupStageProgressModel struct {
	entity.GroupStageProgress
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

func (GroupStageProgressModel) TableName() string { return "group_stage_progress" }

func (m *GroupStageProgressModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	m.UpdatedAt = m.CreatedAt
	return nil
}

func (m *GroupStageProgressModel) ToEntity() *entity.GroupStageProgress {
	e := m.GroupStageProgress
	return &e
}

func groupStageProgressModelFromEntity(e *entity.GroupStageProgress) *GroupStageProgressModel {
	return &GroupStageProgressModel{GroupStageProgress: *e}
}

// ParticipantModel is the GORM persistence model for participants.
type ParticipantModel struct {
	entity.Participant
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

func (ParticipantModel) TableName() string { return "participants" }

func (m *ParticipantModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	m.UpdatedAt = m.CreatedAt
	return nil
}

func (m *ParticipantModel) ToEntity() *entity.Participant {
	e := m.Participant
	return &e
}

func participantModelFromEntity(e *entity.Participant) *ParticipantModel {
	return &ParticipantModel{Participant: *e}
}
