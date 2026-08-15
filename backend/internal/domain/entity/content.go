package entity

import "time"

// Assessment is a star-rating + comment given to a participant at a session stage.
type Assessment struct {
	BaseModel
	ParticipantID  string     `json:"participant_id"`
	SessionID      string     `json:"session_id"`
	SessionStageID string     `json:"session_stage_id"`
	StarRating     int        `json:"star_rating"`
	Comment        string     `json:"comment,omitempty"`
	AssessedBy     string     `json:"assessed_by"`
	AssessedAt     time.Time  `json:"assessed_at"`
	SyncStatus     SyncStatus `json:"sync_status"`
}

// SmartPhoto is a captured photo of a participant, optionally framed.
type SmartPhoto struct {
	BaseModel
	ParticipantID   string     `json:"participant_id"`
	SessionID       string     `json:"session_id"`
	FrameID         string     `json:"frame_id,omitempty"`
	OriginalFileURL string     `json:"original_file_url"`
	FramedFileURL   string     `json:"framed_file_url,omitempty"`
	IsReportPhoto   bool       `json:"is_report_photo"`
	TakenBy         string     `json:"taken_by"`
	TakenAt         time.Time  `json:"taken_at"`
	SyncStatus      SyncStatus `json:"sync_status"`
}

// Recording is a captured audio/video of a participant at a session stage.
type Recording struct {
	BaseModel
	ParticipantID   string                 `json:"participant_id"`
	SessionID       string                 `json:"session_id"`
	SessionStageID  string                 `json:"session_stage_id"`
	FileURL         string                 `json:"file_url,omitempty"`
	DurationSeconds int                    `json:"duration_seconds"`
	FileSizeBytes   int64                  `json:"file_size_bytes,omitempty"`
	TranscriptText  string                 `json:"transcript_text,omitempty"`
	EmotionTags     []string               `json:"emotion_tags,omitempty" gorm:"-"`
	ReviewStatus    RecordingsReviewStatus `json:"review_status"`
	ReviewedBy      *string                `json:"reviewed_by,omitempty"`
	ReviewedAt      *time.Time             `json:"reviewed_at,omitempty"`
	SyncStatus      SyncStatus             `json:"sync_status"`
}

// Report is the generated narrative report for one participant in one session.
type Report struct {
	BaseModel
	ParticipantID        string       `json:"participant_id"`
	SessionID            string       `json:"session_id"`
	AINarrativeDraft     string       `json:"ai_narrative_draft,omitempty"`
	AINarrativeFinal     string       `json:"ai_narrative_final,omitempty"`
	ReportPDFURL         string       `json:"report_pdf_url,omitempty"`
	ParentAccessToken    string       `json:"-"`
	ParentTokenExpiresAt *time.Time   `json:"-"`
	ParentTokenRevoked   bool         `json:"-"`
	Status               ReportStatus `json:"status"`
	GeneratedAt          *time.Time   `json:"generated_at,omitempty"`
	SentAt               *time.Time   `json:"sent_at,omitempty"`
	ApprovedBy           *string      `json:"approved_by,omitempty"`
	MissionIDs           []string     `json:"mission_ids,omitempty" gorm:"-"`
}

// ParticipantMission links a report to a completed mission from the mission bank.
type ParticipantMission struct {
	BaseModel
	ReportID      string     `json:"report_id"`
	MissionBankID string     `json:"mission_bank_id"`
	IsCompleted   bool       `json:"is_completed"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
}

// ConsentLog records a parent's consent response for recording/photo.
type ConsentLog struct {
	BaseModel
	ParticipantID string      `json:"participant_id"`
	SessionID     string      `json:"session_id"`
	ConsentType   ConsentType `json:"consent_type"`
	Value         bool        `json:"value"`
	SentAt        time.Time   `json:"sent_at"`
	RespondedAt   *time.Time  `json:"responded_at,omitempty"`
	IPAddress     string      `json:"ip_address,omitempty"`
	UserAgent     string      `json:"user_agent,omitempty"`
	ConsentToken  string      `json:"consent_token,omitempty"`
	ConsumedAt    *time.Time  `json:"consumed_at,omitempty"`
	ExpiresAt     *time.Time  `json:"expires_at,omitempty"`
}

// TimelineEvent is a realtime log entry for the live dashboard.
type TimelineEvent struct {
	BaseModel
	SessionID string            `json:"session_id"`
	GroupID   string            `json:"group_id"`
	Type      TimelineEventType `json:"type"`
	Message   string            `json:"message"`
	UserID    string            `json:"user_id,omitempty"`
}

// MissionBank is a reusable mission template (Home/Parent/School) tied to a program + tenant.
type MissionBank struct {
	BaseModel
	TenantID          string          `json:"tenant_id"`
	ProgramID         string          `json:"program_id"`
	Category          MissionCategory `json:"category"`
	TitleChild        string          `json:"title_child"`
	TitleParent       string          `json:"title_parent"`
	DescriptionParent string          `json:"description_parent,omitempty"`
	RelatedStageIDs   []string        `json:"related_stage_ids,omitempty" gorm:"-"`
	IsActive          bool            `json:"is_active"`
}

// PhotoFrame is a decorative frame overlay (per tenant + optional program) applied to photos.
type PhotoFrame struct {
	BaseModel
	TenantID     string `json:"tenant_id"`
	ProgramID    string `json:"program_id,omitempty"`
	Name         string `json:"name"`
	FileURL      string `json:"file_url"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	IsActive     bool   `json:"is_active"`
	SortOrder    int    `json:"sort_order"`
}

// Content is a standalone, tenant-scoped, reusable media asset. It is NOT owned
// by a stage: many program stages can reference the same Content via the
// stage_contents junction (Model A / single-source refactor).
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
	ContentID      string    `json:"content_id"`
	ProgramStageID string    `json:"program_stage_id"`
	SortOrder      int       `json:"sort_order"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ContentUsage describes a single (program, stage) where a Content is used.
type ContentUsage struct {
	ProgramID   string `json:"program_id"`
	ProgramName string `json:"program_name"`
	StageID     string `json:"stage_id"`
	StageName   string `json:"stage_name"`
}

// StageContent is the JOIN-shaped projection returned by the kiosk/learner path.
type StageContent struct {
	ID              string               `json:"id"`
	ProgramStageID  string               `json:"program_stage_id"`
	Title           string               `json:"title"`
	FileURL         string               `json:"file_url"`
	YouTubeURL      string               `json:"youtube_url,omitempty"`
	FileType        StageContentFileType `json:"file_type"`
	DurationSeconds int                  `json:"duration_seconds,omitempty"`
	SortOrder       int                  `json:"sort_order"`
	IsActive        bool                 `json:"is_active"`
	CreatedAt       time.Time            `json:"created_at"`
}
