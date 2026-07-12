package entity

// Program is a reusable edutourism curriculum owned by a tenant.
type Program struct {
	BaseModel
	TenantID     *string `json:"tenant_id,omitempty"`
	Name         string  `json:"name"`
	Description  string `json:"description,omitempty"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	IsActive     bool   `json:"is_active"`
}

// ProgramStage is an ordered step within a program.
type ProgramStage struct {
	BaseModel
	ProgramID        string     `json:"program_id"`
	SequenceOrder    int        `json:"sequence_order"`
	Name             string     `json:"name"`
	Description      string     `json:"description,omitempty"`
	ContentType      ContentType `json:"content_type"`
	DurationMinutes  int        `json:"duration_minutes"`
	IsRecordingStage bool       `json:"is_recording_stage"`
	IsPhotoStage     bool       `json:"is_photo_stage"`
}

// StageContent is a media asset belonging to a program stage.
type StageContent struct {
	BaseModel
	ProgramStageID string              `json:"program_stage_id"`
	Title          string              `json:"title"`
	FileURL        string              `json:"file_url"`
	FileType       StageContentFileType `json:"file_type"`
	DurationSeconds int                `json:"duration_seconds,omitempty"`
	SortOrder      int                 `json:"sort_order"`
	IsActive       bool                `json:"is_active"`
}

// NOTE: MissionBank and PhotoFrame are defined in content.go (richer, tenant-scoped
// versions matching the DDL). They were previously also declared here, causing a
// redeclaration conflict; this file keeps Program/ProgramStage/StageContent only.
