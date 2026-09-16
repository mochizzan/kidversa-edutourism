package entity

import "time"

// ParticipantAttendance tracks whether a participant was present at a session.
type ParticipantAttendance struct {
	BaseModel
	ParticipantID string    `json:"participant_id"`
	SessionID     string    `json:"session_id"`
	IsPresent     bool      `json:"is_present"`
	MarkedAt      time.Time `json:"marked_at"`
	MarkedBy      *string   `json:"marked_by,omitempty"`
}
