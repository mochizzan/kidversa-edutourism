package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// ProgramRequest is the create/update payload for programs.
type ProgramRequest struct {
	Name               *string `json:"name,omitempty"`
	Description        *string `json:"description,omitempty"`
	IsActive           *bool   `json:"is_active,omitempty"`
	FinalBadgeName     *string `json:"final_badge_name,omitempty"`
	FinalBadgeImageURL *string `json:"final_badge_image_url,omitempty"`
}

// ProgramStageRequest is the create/update payload for Topik.
type ProgramStageRequest struct {
	SequenceOrder int                `json:"sequence_order,omitempty"`
	Name          string             `json:"name" validate:"required"`
	Description   string             `json:"description,omitempty"`
	ContentType   entity.ContentType `json:"content_type" validate:"required"`
	// Badge fields follow the pointer convention of ProgramRequest: absent key
	// -> nil -> leave the stored value untouched; present (even "") -> set/clear.
	BadgeName     *string `json:"badge_name,omitempty"`
	BadgeImageURL *string `json:"badge_image_url,omitempty"`
}

// ContentRequest is the create/update payload for the standalone Content entity
// (Model A). Global fields only; per-Kegiatan activation lives on the junction.
type ContentRequest struct {
	Title           string                      `json:"title" validate:"required"`
	FileURL         string                      `json:"file_url"`
	YouTubeURL      string                      `json:"youtube_url,omitempty"`
	FileType        entity.StageContentFileType `json:"file_type" validate:"required"`
	DurationSeconds int                         `json:"duration_seconds,omitempty"`
}

// ToggleActiveResponse is returned by the toggle-active endpoint.
type ToggleActiveResponse struct {
	ID       string `json:"id"`
	IsActive bool   `json:"is_active"`
}
