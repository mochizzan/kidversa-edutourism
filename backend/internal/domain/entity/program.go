package entity

// Program is a reusable edutourism curriculum owned by a tenant.
type Program struct {
	BaseModel
	TenantID           *string `json:"tenant_id,omitempty"`
	Name               string  `json:"name"`
	Description        string  `json:"description,omitempty"`
	ThumbnailURL       string  `json:"thumbnail_url,omitempty"`
	IsActive           bool    `json:"is_active"`
	FinalBadgeName     string  `json:"final_badge_name,omitempty"`
	FinalBadgeImageURL string  `json:"final_badge_image_url,omitempty"`
}

// ProgramStage is an ordered step within a program.
type ProgramStage struct {
	BaseModel
	ProgramID       string      `json:"program_id"`
	SequenceOrder   int         `json:"sequence_order"`
	Name            string      `json:"name"`
	Description     string      `json:"description,omitempty"`
	ContentType  ContentType `json:"content_type"`
	IsPhotoStage bool        `json:"is_photo_stage"`
	BadgeName       string      `json:"badge_name,omitempty"`
	BadgeImageURL   string      `json:"badge_image_url,omitempty"`
}

// NOTE: StageContent (now the JOIN-shaped kiosk/learner projection), MissionBank,
// and PhotoFrame are defined in content.go. This file keeps Program/ProgramStage
// only to avoid redeclaration conflicts.
