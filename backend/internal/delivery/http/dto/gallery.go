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
}

// GalleryPhotoDTO is a single photo entry in the public gallery.
type GalleryPhotoDTO struct {
	ID              string `json:"id"`
	OriginalFileURL string `json:"original_file_url"`
	FramedFileURL   string `json:"framed_file_url,omitempty"`
	IsReportPhoto   bool   `json:"is_report_photo"`
	TakenAt         string `json:"taken_at"`
	TakenBy         string `json:"taken_by"`
}

// NewPublicGalleryDTO builds the safe public gallery view (no PII beyond child
// name, no token, no admin-only fields).
func NewPublicGalleryDTO(report *entity.Report, participant *entity.Participant, photos []entity.SmartPhoto) *PublicGalleryDTO {
	dtos := make([]GalleryPhotoDTO, len(photos))
	for i, p := range photos {
		dtos[i] = GalleryPhotoDTO{
			ID:              p.ID,
			OriginalFileURL: p.OriginalFileURL,
			FramedFileURL:   p.FramedFileURL,
			IsReportPhoto:   p.IsReportPhoto,
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
	}
}
