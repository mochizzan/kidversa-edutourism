package dto

import "kidversa-edutourism-backend/internal/domain/entity"

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

// PublicReportDTO is the anti-IDOR safe view returned to a parent presenting a
// valid access token. It intentionally omits PII and the raw token.
type PublicReportDTO struct {
	ID               string `json:"id"`
	ParticipantID    string `json:"participant_id"`
	SessionID        string `json:"session_id"`
	Status           string `json:"status"`
	AINarrativeFinal string `json:"ai_narrative_final,omitempty"`
	MissionIDsJSON   string `json:"mission_ids_json,omitempty"`
	ReportPDFURL     string `json:"report_pdf_url,omitempty"`
}

// NewPublicReportDTO builds the safe public view (no PII beyond IDs, no token).
func NewPublicReportDTO(r *entity.Report) *PublicReportDTO {
	return &PublicReportDTO{
		ID:               r.ID,
		ParticipantID:    r.ParticipantID,
		SessionID:        r.SessionID,
		Status:           string(r.Status),
		AINarrativeFinal: r.AINarrativeFinal,
		MissionIDsJSON:   string(r.MissionIDsJSON),
		ReportPDFURL:     r.ReportPDFURL,
	}
}

// ReportGenerateRequest triggers async narrative generation (placeholder).
type ReportGenerateRequest struct {
	Draft bool `json:"draft"`
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
	return &ReportTokenResponse{
		ID:                r.ID,
		ParentAccessToken: r.ParentAccessToken,
		TokenExpiresAt:    r.ParentTokenExpiresAt,
		Status:            string(r.Status),
	}
}

// ReportApproveRequest carries the approver identity.
type ReportApproveRequest struct {
	ApprovedBy string `json:"approved_by" validate:"required"`
}
