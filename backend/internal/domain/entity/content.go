package entity

// Assessment is a star-rating + comment given to a participant at a session stage.
type Assessment struct {
	BaseModel
	ParticipantID  string     `json:"participant_id"`
	SessionID      string     `json:"session_id"`
	SessionStageID string     `json:"session_stage_id"`
	StarRating     int        `json:"star_rating"`
	Comment        string     `json:"comment,omitempty"`
	AssessedBy     string     `json:"assessed_by"`
	AssessedAt     string     `json:"assessed_at"`
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
	TakenAt         string     `json:"taken_at"`
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
	EmotionTagsJSON RawJSON                `json:"emotion_tags_json,omitempty"`
	ReviewStatus    RecordingsReviewStatus `json:"review_status"`
	ReviewedBy      *string                `json:"reviewed_by,omitempty"`
	ReviewedAt      *string                `json:"reviewed_at,omitempty"`
	SyncStatus      SyncStatus             `json:"sync_status"`
}

// Report is the generated narrative report for one participant in one session.
type Report struct {
	BaseModel
	ParticipantID        string       `json:"participant_id"`
	SessionID            string       `json:"session_id"`
	AINarrativeDraft     string       `json:"ai_narrative_draft,omitempty"`
	AINarrativeFinal     string       `json:"ai_narrative_final,omitempty"`
	MissionIDsJSON       RawJSON      `json:"mission_ids_json,omitempty"`
	ReportPDFURL         string       `json:"report_pdf_url,omitempty"`
	ParentAccessToken    string       `json:"-"`
	ParentTokenExpiresAt *string      `json:"-"`
	ParentTokenRevoked   bool         `json:"-"`
	Status               ReportStatus `json:"status"`
	GeneratedAt          *string      `json:"generated_at,omitempty"`
	SentAt               *string      `json:"sent_at,omitempty"`
	ApprovedBy           *string      `json:"approved_by,omitempty"`
}

// ParticipantMission links a report to a completed mission from the mission bank.
type ParticipantMission struct {
	BaseModel
	ParticipantID string  `json:"participant_id"`
	ReportID      string  `json:"report_id"`
	MissionBankID string  `json:"mission_bank_id"`
	IsCompleted   bool    `json:"is_completed"`
	CompletedAt   *string `json:"completed_at,omitempty"`
}

// ConsentLog records a parent's consent response for recording/photo.
type ConsentLog struct {
	BaseModel
	ParticipantID string      `json:"participant_id"`
	SessionID     string      `json:"session_id"`
	ConsentType   ConsentType `json:"consent_type"`
	Value         bool        `json:"value"`
	SentAt        string      `json:"sent_at"`
	RespondedAt   *string     `json:"responded_at,omitempty"`
	IPAddress     string      `json:"ip_address,omitempty"`
	UserAgent     string      `json:"user_agent,omitempty"`
	// ConsentToken is the single-use, unguessable token used by the public
	// respond-public flow (plan B10). Empty for rows created via the JWT flow.
	ConsentToken string `json:"consent_token,omitempty"`
	// ConsumedAt is set when the token-based response is recorded (replay protection).
	ConsumedAt *string `json:"consumed_at,omitempty"`
	// ExpiresAt is the RFC3339 expiry of the consent token.
	ExpiresAt *string `json:"expires_at,omitempty"`
}

// TimelineEvent is a realtime log entry for the live dashboard (replaces frontend simulation).
type TimelineEvent struct {
	BaseModel
	SessionID string `json:"session_id"`
	GroupID   string `json:"group_id"`
	Type      string `json:"type"` // group:progress|group:completed|stage:unlock|override
	Message   string `json:"message"`
	UserID    string `json:"user_id,omitempty"`
}

// MissionBank is a reusable mission template (Home/Parent/School) tied to a program + tenant.
type MissionBank struct {
	BaseModel
	TenantID            string          `json:"tenant_id"`
	ProgramID           string          `json:"program_id"`
	Category            MissionCategory `json:"category"`
	TitleChild          string          `json:"title_child"`
	TitleParent         string          `json:"title_parent"`
	DescriptionParent   string          `json:"description_parent,omitempty"`
	RelatedStageIDsJSON RawJSON         `json:"related_stage_ids_json,omitempty"`
	IsActive            bool            `json:"is_active"`
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
