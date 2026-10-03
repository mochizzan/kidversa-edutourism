package dto

import (
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
	reportsuc "kidversa-edutourism-backend/internal/usecase/reports"
)

// ReportResponse is the authenticated read representation of a report. It is
// emitted ONLY on the JWT + tenant-scoped staff routes (GET /api/reports and
// POST /api/reports/:id/{approve,missions,gallery-token}); the public,
// token-scoped parent view is PublicReportDTO, a separate struct that never
// embeds this type.
type ReportResponse struct {
	*entity.Report
	// ParentAccessToken is the parent share token, distributed to scoped
	// STAFF readers so the admin review page can render the parent link /
	// copy-link actions. The entity keeps json:"-" (every other serialization
	// path of the entity stays token-free); the DTO field is always present
	// ("" when the report has not been sent yet) to match the frontend
	// Report.parent_access_token: string contract.
	ParentAccessToken string `json:"parent_access_token"`
}

// NewReportResponse wraps a report entity. Token expiry/revoke stay json:"-"
// on the entity and are NOT copied here; only the parent access token is
// distributed explicitly, via the field above.
func NewReportResponse(r *entity.Report) *ReportResponse {
	return &ReportResponse{Report: r, ParentAccessToken: r.ParentAccessToken}
}

// ReportListResponse carries a page of reports with pagination meta plus the
// optional top-level delivery/generation flags of the delivery-status design.
type ReportListResponse struct {
	Items []ReportResponse `json:"items"`
	// ActiveGenerate is present only while a session-level narrative generate
	// (POST /api/reports/generate) is running for the queried session+tenant.
	ActiveGenerate *ReportActiveGenerate `json:"active_generate,omitempty"`
	// ActiveSend is present only while a declared send queue for the queried
	// session+tenant has unsent rows or an in-flight send.
	ActiveSend *ReportActiveSend `json:"active_send,omitempty"`
}

// ReportGenerateItem is one report's status inside active_generate. status is
// queued|processing|success|error|skipped (derived from the report's narrative
// and mission phase); phase (narrative|missions) is set while processing or on
// failure; error carries the failure message when status=error.
// mission_skip_reason / narrative_skip_reason carry a machine code
// (mission_bank_empty | no_assessments) when that phase was intentionally not
// generated: a fully skipped item has status=skipped plus both reasons; a
// partial skip keeps status=success with just the skip reason attached.
type ReportGenerateItem struct {
	ReportID            string `json:"report_id"`
	Status              string `json:"status"`
	Phase               string `json:"phase,omitempty"`
	Error               string `json:"error,omitempty"`
	MissionSkipReason   string `json:"mission_skip_reason,omitempty"`
	NarrativeSkipReason string `json:"narrative_skip_reason,omitempty"`
}

// ReportActiveGenerate snapshots an in-flight session generate run: the
// per-report items (authoritative row display) plus aggregates, and the
// narrative-phase queued/processing id views kept for existing consumers.
type ReportActiveGenerate struct {
	SessionID     string               `json:"session_id"`
	StartedAt     string               `json:"started_at"` // RFC3339
	QueuedIDs     []string             `json:"queued_ids"`
	ProcessingIDs []string             `json:"processing_ids"`
	Items         []ReportGenerateItem `json:"items"`
	Total         int                  `json:"total"`
	Queued        int                  `json:"queued"`
	Processing    int                  `json:"processing"`
	Succeeded     int                  `json:"succeeded"`
	Failed        int                  `json:"failed"`
}

// NewReportActiveGenerate maps a registry snapshot onto the envelope DTO.
func NewReportActiveGenerate(gs reportsuc.GenerateStatus) *ReportActiveGenerate {
	items := make([]ReportGenerateItem, 0, len(gs.Items))
	for _, it := range gs.Items {
		items = append(items, ReportGenerateItem{
			ReportID:            it.ReportID,
			Status:              it.Status,
			Phase:               it.Phase,
			Error:               it.Error,
			MissionSkipReason:   it.MissionSkipReason,
			NarrativeSkipReason: it.NarrativeSkipReason,
		})
	}
	return &ReportActiveGenerate{
		SessionID:     gs.SessionID,
		StartedAt:     gs.StartedAt.Format(time.RFC3339),
		QueuedIDs:     gs.QueuedIDs,
		ProcessingIDs: gs.ProcessingIDs,
		Items:         items,
		Total:         gs.Total,
		Queued:        gs.Queued,
		Processing:    gs.Processing,
		Succeeded:     gs.Succeeded,
		Failed:        gs.ErrorCount,
	}
}

// ReportGenerateAccepted is the 202 body of POST /api/reports/generate: the
// run was accepted and continues in the background; progress is read from
// GET /api/reports?session_id= (active_generate), never from this response.
type ReportGenerateAccepted struct {
	Status    string `json:"status"` // always "accepted"
	SessionID string `json:"session_id"`
}

// ReportActiveSend snapshots the declared send run for a session.
type ReportActiveSend struct {
	SessionID  string   `json:"session_id"`
	UpdatedAt  string   `json:"updated_at"` // RFC3339
	QueuedIDs  []string `json:"queued_ids"`
	SendingIDs []string `json:"sending_ids"`
}

// NewReportListResponse wraps a slice of reports.
func NewReportListResponse(items []entity.Report) *ReportListResponse {
	out := make([]ReportResponse, 0, len(items))
	for i := range items {
		out = append(out, ReportResponse{Report: &items[i], ParentAccessToken: items[i].ParentAccessToken})
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
	ProgramStageID   string   `json:"program_stage_id"`
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
		ProgramStageID:     r.ProgramStageID,
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
// Queue optionally declares ALL report IDs the client still intends to send in
// this run (including the target of this request); the server tracks them in
// an in-memory run so GET /api/reports can expose active_send.
type ReportSendRequest struct {
	TTLHours int      `json:"ttl_hours"`
	Queue    []string `json:"queue,omitempty"`
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
// topic_id optionally pins the run to a SINGLE topic of the session: when set,
// only that topic's reports are created/generated (generate-all must never
// cross topics — 1 topic = 1 separate report); when absent, every topic of the
// session is generated (back-compat).
type ReportGenerateSessionRequest struct {
	SessionID     string  `json:"session_id" validate:"required,uuid"`
	ParticipantID string  `json:"participant_id,omitempty" validate:"omitempty,uuid"`
	TopicID       *string `json:"topic_id,omitempty" validate:"omitempty,uuid"`
}
