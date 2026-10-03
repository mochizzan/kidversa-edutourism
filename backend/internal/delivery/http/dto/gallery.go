package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// PublicGalleryDTO is the anti-IDOR safe view returned to a parent presenting a
// valid gallery token. It exposes only consented photos — no PII beyond child
// name, no raw token.
type PublicGalleryDTO struct {
	ReportID      string            `json:"report_id"`
	ParticipantID string            `json:"participant_id"`
	SessionID     string            `json:"session_id"`
	GroupName     string            `json:"group_name"`
	ChildName     string            `json:"child_name"`
	Photos        []GalleryPhotoDTO `json:"photos"`
	// Topics lists the session's topics (session_stages) in program sequence —
	// the parent gallery's topic switcher: photos are matched to a topic via
	// their session_stage_id. Empty when the session has no stages.
	Topics []GalleryTopic `json:"topics"`
}

// GalleryTopic is one topic pill of the parent gallery switcher: the session's
// instantiation of a program stage (session_stage_id) plus the program stage
// it instantiates (program_stage_id) and its display name.
type GalleryTopic struct {
	SessionStageID string `json:"session_stage_id"`
	ProgramStageID string `json:"program_stage_id"`
	Name           string `json:"name"`
}

// GalleryPhotoDTO is a single photo entry in the public gallery.
type GalleryPhotoDTO struct {
	ID              string `json:"id"`
	OriginalFileURL string `json:"original_file_url"`
	FramedFileURL   string `json:"framed_file_url,omitempty"`
	IsReportPhoto   bool   `json:"is_report_photo"`
	// ReportPhoto marks the photo backing the report token's topic (pick wins;
	// is_report_photo only when the topic has no pick). Computed server-side.
	ReportPhoto bool `json:"report_photo"`
	// SessionStageID is the photo's topic ("" = legacy photo without a topic,
	// migration 000009 sentinel) — matched against Topics[].session_stage_id.
	SessionStageID string `json:"session_stage_id"`
	TakenAt        string `json:"taken_at"`
	TakenBy        string `json:"taken_by"`
}

// NewPublicGalleryDTO builds the safe public gallery view (no PII beyond child
// name, no token, no admin-only fields). reportPhotoID is the ID of the photo
// backing the report token's topic ("" when none resolves); topics is the
// session's topic list for the switcher (ordered as listed — program
// sequence).
func NewPublicGalleryDTO(report *entity.Report, participant *entity.Participant, photos []entity.SmartPhoto, reportPhotoID string, topics []GalleryTopic) *PublicGalleryDTO {
	dtos := make([]GalleryPhotoDTO, len(photos))
	for i, p := range photos {
		dtos[i] = GalleryPhotoDTO{
			ID:              p.ID,
			OriginalFileURL: p.OriginalFileURL,
			FramedFileURL:   p.FramedFileURL,
			IsReportPhoto:   p.IsReportPhoto,
			ReportPhoto:     p.ID == reportPhotoID,
			SessionStageID:  p.SessionStageID,
			TakenAt:         p.TakenAt.Format("2006-01-02T15:04:05Z07:00"),
			TakenBy:         p.TakenBy,
		}
	}
	return &PublicGalleryDTO{
		ReportID:      report.ID,
		ParticipantID: report.ParticipantID,
		SessionID:     report.SessionID,
		GroupName:     report.GroupName,
		ChildName:     participant.ChildName,
		Photos:        dtos,
		Topics:        topics,
	}
}
