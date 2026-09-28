package dto

import (
	"kidversa-edutourism-backend/internal/domain/entity"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
	reportsuc "kidversa-edutourism-backend/internal/usecase/reports"
)

// ReportResponse is the authenticated read representation of a report.
type ReportResponse struct {
	*entity.Report
}

// NewReportResponse wraps a report entity. Note: ParentAccessToken and token
// expiry/revoke are json:"-" on the entity, so they are never serialized here.
func NewReportResponse(r *entity.Report) *ReportResponse {
	return &ReportResponse{Report: r}
}

// ReportListResponse carries a page of reports with pagination meta.
type ReportListResponse struct {
	Items []ReportResponse `json:"items"`
}

// NewReportListResponse wraps a slice of reports.
func NewReportListResponse(items []entity.Report) *ReportListResponse {
	out := make([]ReportResponse, 0, len(items))
	for i := range items {
		out = append(out, ReportResponse{Report: &items[i]})
	}
	return &ReportListResponse{Items: out}
}

// PublicReportDTO is the public view returned to a parent presenting a valid
// parent access token (GET /api/reports/access). It carries the same content
// the admin mini-raport preview assembles (program/child/session, stages,
// missions, badges, gallery) so the parent render matches the admin preview;
// PII stays limited to the report's own child/program data — parent contact
// fields never appear, and the raw access token itself NEVER enters the DTO.
type PublicReportDTO struct {
	ID               string   `json:"id"`
	ParticipantID    string   `json:"participant_id"`
	SessionID        string   `json:"session_id"`
	Status           string   `json:"status"`
	AINarrativeFinal string   `json:"ai_narrative_final,omitempty"`
	MissionIDs       []string `json:"mission_ids,omitempty"`
	ReportPDFURL     string   `json:"report_pdf_url,omitempty"`
	GroupName        string   `json:"group_name,omitempty"`
	FacilitatorName  string   `json:"facilitator_name,omitempty"`
	// PhotoURL is the token-free access-photo path, present only when a photo
	// resolves for this report's topic AND photo consent is granted (omitempty).
	PhotoURL           string `json:"photo_url,omitempty"`
	ProgramName        string `json:"program_name,omitempty"`
	TopicName          string `json:"topic_name,omitempty"`
	ChildName          string `json:"child_name,omitempty"`
	ChildAge           int    `json:"child_age"`
	SchoolName         string `json:"school_name,omitempty"`
	SessionDate        string `json:"session_date,omitempty"`
	GalleryAccessToken string `json:"gallery_access_token,omitempty"`
	// Stages/Missions/Badges mirror the admin preview as assembled by the
	// reports usecase; the client applies the RAPORT_LAYOUT caps. Always
	// present, possibly empty.
	Stages   []reportsuc.PublicStage   `json:"stages"`
	Missions []reportsuc.PublicMission `json:"missions"`
	Badges   []reportsuc.PublicBadge   `json:"badges"`
}

// NewPublicReportDTO builds the public view from the report plus its assembled
// mini-raport content (view). photoURL is "" when no photo resolves or consent
// is off. The access token itself is never serialized.
func NewPublicReportDTO(r *entity.Report, view *reportsuc.PublicReportView, photoURL string) *PublicReportDTO {
	return &PublicReportDTO{
		ID:                 r.ID,
		ParticipantID:      r.ParticipantID,
		SessionID:          r.SessionID,
		Status:             string(r.Status),
		AINarrativeFinal:   r.AINarrativeFinal,
		MissionIDs:         r.MissionIDs,
		ReportPDFURL:       r.ReportPDFURL,
		GroupName:          view.GroupName,
		FacilitatorName:    view.FacilitatorName,
		PhotoURL:           photoURL,
		ProgramName:        view.ProgramName,
		TopicName:          view.TopicName,
		ChildName:          view.ChildName,
		ChildAge:           view.ChildAge,
		SchoolName:         view.SchoolName,
		SessionDate:        view.SessionDate,
		GalleryAccessToken: r.GalleryAccessToken,
		Stages:             view.Stages,
		Missions:           view.Missions,
		Badges:             view.Badges,
	}
}

// ReportSendRequest carries the token TTL in hours when sending a report.
type ReportSendRequest struct {
	TTLHours int `json:"ttl_hours"`
}

// ReportTokenResponse is returned by /send so the caller (authenticated staff)
// can obtain the freshly generated parent access token to share with the parent.
// It is NOT the public view — the token is intentionally exposed here only to
// the privileged sender.
type ReportTokenResponse struct {
	ID                string  `json:"id"`
	ParentAccessToken string  `json:"parent_access_token"`
	TokenExpiresAt    *string `json:"token_expires_at,omitempty"`
	Status            string  `json:"status"`
}

// NewReportTokenResponse builds the token-bearing response.
func NewReportTokenResponse(r *entity.Report) *ReportTokenResponse {
	var expiresAt *string
	if r.ParentTokenExpiresAt != nil {
		s := apputil.FormatISO(*r.ParentTokenExpiresAt)
		expiresAt = &s
	}
	return &ReportTokenResponse{
		ID:                r.ID,
		ParentAccessToken: r.ParentAccessToken,
		TokenExpiresAt:    expiresAt,
		Status:            string(r.Status),
	}
}

// ReportApproveRequest carries the approver identity plus optional finalized
// narrative and mission selections.
type ReportApproveRequest struct {
	ApprovedBy     string   `json:"approved_by,omitempty" validate:"omitempty"`
	NarrativeFinal string   `json:"narrative_final"`
	MissionIDs     []string `json:"mission_ids"`
}

// ReportSaveMissionsRequest carries the mission IDs to persist for a report
// (auto-save, does not change report status).
type ReportSaveMissionsRequest struct {
	MissionIDs []string `json:"mission_ids"`
}

// ReportGenerateSessionRequest triggers narrative generation for all participants
// in a session. Creates DRAFT reports for participants that don't have one yet.
type ReportGenerateSessionRequest struct {
	SessionID     string `json:"session_id" validate:"required,uuid"`
	ParticipantID string `json:"participant_id,omitempty" validate:"omitempty,uuid"`
}
