package entity

import "time"

// Content is a standalone, tenant-scoped, reusable media asset. It is NOT owned
// by a stage: many program stages can reference the same Content via the
// stage_contents junction (Model A / single-source refactor).
//
// Global fields (Title/FileURL/YouTubeURL/FileType/DurationSeconds) live here;
// per-stage state (sort_order, is_active) lives on the junction (StageContentRef).
//
// `Contents.ID` is the ONLY media id used by the kiosk/learner:
// /api/media/kiosk/content/:id resolves to contents.id -> contents.file_url.
type Content struct {
	BaseModel
	TenantID        string               `json:"tenant_id"`
	Title           string               `json:"title"`
	FileURL         string               `json:"file_url"`
	YouTubeURL      string               `json:"youtube_url,omitempty" gorm:"column:youtube_url"`
	FileType        StageContentFileType `json:"file_type"`
	DurationSeconds int                  `json:"duration_seconds,omitempty"`
}

// StageContentRef is one row of the stage_contents junction: a Content assigned
// to a Stage with per-stage ordering + activation.
type StageContentRef struct {
	ContentID      string               `json:"content_id"`
	ProgramStageID string               `json:"program_stage_id"`
	SortOrder      int                  `json:"sort_order"`
	IsActive       bool                 `json:"is_active"`
	CreatedAt      time.Time            `json:"created_at"`
	UpdatedAt      time.Time            `json:"updated_at"`
}

// ContentUsage describes a single (program, stage) where a Content is used —
// surfaced by the Manager "delete confirm" dialog (A3a).
type ContentUsage struct {
	ProgramID   string `json:"program_id"`
	ProgramName string `json:"program_name"`
	StageID     string `json:"stage_id"`
	StageName   string `json:"stage_name"`
}

// StageContent is the JOIN-shaped projection returned by the kiosk/learner path
// and consumed by the frontend. It flattens StageContentRef + Content so the
// JSON shape is backward-compatible with the old stage-coupled content DTO
// (E22/CRIT-7): id == ContentID, file_url/file_type/duration_seconds come from
// the Content, sort_order/is_active come from the junction.
type StageContent struct {
	ID             string               `json:"id"`
	ProgramStageID string               `json:"program_stage_id"`
	Title          string               `json:"title"`
	FileURL        string               `json:"file_url"`
	YouTubeURL     string               `json:"youtube_url,omitempty"`
	FileType       StageContentFileType `json:"file_type"`
	DurationSeconds int                 `json:"duration_seconds,omitempty"`
	SortOrder      int                  `json:"sort_order"`
	IsActive       bool                 `json:"is_active"`
	CreatedAt      time.Time            `json:"created_at"`
}
