package entity

// Program is a reusable edutourism curriculum owned by a tenant.
type Program struct {
	BaseModel
	TenantID     *string `json:"tenant_id,omitempty"`
	Name         string  `json:"name"`
	Description  string  `json:"description,omitempty"`
	ThumbnailURL string  `json:"thumbnail_url,omitempty"`
	IsActive     bool    `json:"is_active"`
}

// ProgramStage is an ordered step within a program.
type ProgramStage struct {
	BaseModel
	ProgramID        string      `json:"program_id"`
	SequenceOrder    int         `json:"sequence_order"`
	Name             string      `json:"name"`
	Description      string      `json:"description,omitempty"`
	ContentType      ContentType `json:"content_type"`
	DurationMinutes  int         `json:"duration_minutes"`
	IsRecordingStage bool        `json:"is_recording_stage"`
	IsPhotoStage     bool        `json:"is_photo_stage"`
}

// NOTE: StageContent (now the JOIN-shaped kiosk/learner projection), MissionBank,
// and PhotoFrame are defined in content.go. This file keeps Program/ProgramStage
// only to avoid redeclaration conflicts.
