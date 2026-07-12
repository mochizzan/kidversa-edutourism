package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// ProgramRequest is the create/update payload for programs.
type ProgramRequest struct {
	Name         string `json:"name" validate:"required"`
	Description  string `json:"description,omitempty"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	IsActive     *bool  `json:"is_active,omitempty"`
}

// ProgramStageRequest is the create/update payload for program stages.
type ProgramStageRequest struct {
	SequenceOrder    int            `json:"sequence_order,omitempty"`
	Name             string         `json:"name" validate:"required"`
	Description      string         `json:"description,omitempty"`
	ContentType      entity.ContentType `json:"content_type" validate:"required"`
	DurationMinutes  int            `json:"duration_minutes,omitempty"`
	IsRecordingStage bool           `json:"is_recording_stage,omitempty"`
	IsPhotoStage     bool           `json:"is_photo_stage,omitempty"`
}

// StageContentRequest is the create/update payload for stage contents.
type StageContentRequest struct {
	Title          string                     `json:"title" validate:"required"`
	FileURL        string                     `json:"file_url" validate:"required"`
	FileType       entity.StageContentFileType `json:"file_type" validate:"required"`
	DurationSeconds int                       `json:"duration_seconds,omitempty"`
	SortOrder      int                        `json:"sort_order,omitempty"`
	IsActive       *bool                      `json:"is_active,omitempty"`
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
