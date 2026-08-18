package entity

import "time"

// SessionSubstageStatus is the lifecycle state of a session substage.
type SessionSubstageStatus string

const (
	SessionSubstageWaiting   SessionSubstageStatus = "WAITING"
	SessionSubstageActive    SessionSubstageStatus = "ACTIVE"
	SessionSubstageCompleted SessionSubstageStatus = "COMPLETED"
)

// ProgramSubstage is an assessed leaf ("Kegiatan") under a program stage.
type ProgramSubstage struct {
	BaseModel
	ProgramStageID  string `json:"program_stage_id"`
	SequenceOrder   int    `json:"sequence_order"`
	Name            string `json:"name"`
	Description     string `json:"description,omitempty"`
	DurationMinutes int    `json:"duration_minutes"`
	IsPhotoStage    bool   `json:"is_photo_stage"`
}

// SessionSubstage is an instantiation of a program substage within a session.
type SessionSubstage struct {
	BaseModel
	SessionID         string                `json:"session_id"`
	SessionStageID    string                `json:"session_stage_id"`
	ProgramSubstageID string                `json:"program_substage_id"`
	Status            SessionSubstageStatus `json:"status"`
	StartedAt         *time.Time            `json:"started_at,omitempty"`
	CompletedAt       *time.Time            `json:"completed_at,omitempty"`
}

// BadgeType discriminates a participant badge as a per-SubTopik award or the
// cross-session Final program award.
const (
	BadgeTypeSubtopik = "SUBTOPIK"
	BadgeTypeFinal    = "FINAL"
)

// ParticipantBadge is an awarded badge row for a participant.
type ParticipantBadge struct {
	BaseModel
	ParticipantID  string    `json:"participant_id"`
	ProgramID      string    `json:"program_id"`
	ProgramStageID *string   `json:"program_stage_id,omitempty"`
	BadgeType      string    `json:"badge_type"`
	BadgeName      string    `json:"badge_name"`
	BadgeImageURL  string    `json:"badge_image_url,omitempty"`
	AwardedAt      time.Time `json:"awarded_at"`
}
