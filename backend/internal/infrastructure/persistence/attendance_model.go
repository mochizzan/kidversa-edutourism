package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// AttendanceModel is the GORM persistence model for participant attendance.
type AttendanceModel struct {
	entity.ParticipantAttendance
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (AttendanceModel) TableName() string { return "participant_attendance" }

// BeforeCreate generates a UUID if missing.
func (m *AttendanceModel) BeforeCreate(*gorm.DB) error {
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
func (m *AttendanceModel) ToEntity() *entity.ParticipantAttendance {
	e := m.ParticipantAttendance
	return &e
}

// attendanceModelFromEntity builds a model from a domain entity.
func attendanceModelFromEntity(e *entity.ParticipantAttendance) *AttendanceModel {
	return &AttendanceModel{ParticipantAttendance: *e}
}
