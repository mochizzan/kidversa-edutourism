package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// ProgramRequest is the create/update payload for programs.
type ProgramRequest struct {
	Name         *string `json:"name,omitempty"`
	Description  *string `json:"description,omitempty"`
	ThumbnailURL *string `json:"thumbnail_url,omitempty"`
	IsActive     *bool   `json:"is_active,omitempty"`
}

// ProgramStageRequest is the create/update payload for Topik.
type ProgramStageRequest struct {
	SequenceOrder   int                `json:"sequence_order,omitempty"`
	Name            string             `json:"name" validate:"required"`
	Description     string             `json:"description,omitempty"`
	ContentType  entity.ContentType `json:"content_type" validate:"required"`
	IsPhotoStage bool               `json:"is_photo_stage,omitempty"`
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

// AssignContentRequest carries the content_id to assign to a Kegiatan.
type AssignContentRequest struct {
	ContentID string `json:"content_id" validate:"required,uuid"`
}

// ReorderRequest carries an ordered list of IDs to re-sequence.
type ReorderRequest struct {
	OrderedIDs []string `json:"ordered_ids" validate:"required"`
}

// ToggleActiveResponse is returned by the toggle-active endpoint.
type ToggleActiveResponse struct {
	ID       string `json:"id"`
	IsActive bool   `json:"is_active"`
}
