package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// ConsentResponse is the read representation of a consent log.
type ConsentResponse struct {
	*entity.ConsentLog
}

// NewConsentResponse wraps a consent-log entity.
func NewConsentResponse(c *entity.ConsentLog) *ConsentResponse {
	return &ConsentResponse{ConsentLog: c}
}

// ConsentRequest is the parent response payload (JWT flow).
type ConsentRequest struct {
	ParticipantID string `json:"participant_id" validate:"required"`
	SessionID     string `json:"session_id" validate:"required"`
	ConsentType   string `json:"consent_type" validate:"required"`
	Value         bool   `json:"value"`
}

// ConsentListResponse carries a list of consent logs.
type ConsentListResponse struct {
	Items []ConsentResponse `json:"items"`
}

// NewConsentListResponse wraps a slice of consent logs.
func NewConsentListResponse(items []entity.ConsentLog) *ConsentListResponse {
	out := make([]ConsentResponse, 0, len(items))
	for i := range items {
		out = append(out, ConsentResponse{ConsentLog: &items[i]})
	}
	return &ConsentListResponse{Items: out}
}

// ConsentSummaryItem carries consent logs for a single session.
type ConsentSummaryItem struct {
	SessionID string            `json:"session_id"`
	Items     []ConsentResponse `json:"items"`
}

// ConsentSummaryResponse carries consent logs for multiple sessions.
type ConsentSummaryResponse struct {
	Sessions []ConsentSummaryItem `json:"sessions"`
}

// ConsentSendWhatsAppRequest is the payload for POST /api/consent/send-whatsapp.
type ConsentSendWhatsAppRequest struct {
	SessionID string `json:"session_id" validate:"required"`
}

// ConsentSendWhatsAppResponse is returned immediately (202) when a batch is queued.
type ConsentSendWhatsAppResponse struct {
	Status  string `json:"status"` // "queued"
	BatchID string `json:"batch_id"`
	Total   int    `json:"total"`
}

// ConsentParticipantResult is one row of the WhatsApp batch progress stream.
type ConsentParticipantResult struct {
	ParticipantID string `json:"participant_id"`
	ChildName     string `json:"child_name"`
	ParentPhone   string `json:"parent_phone"`
	Status        string `json:"status"` // "sent" | "failed" | "skipped"
	Error         string `json:"error,omitempty"`
}

// ConsentRespondCombinedRequest is the public combined-consent payload.
type ConsentRespondCombinedRequest struct {
	Token     string `json:"token" validate:"required"`
	Recording bool   `json:"recording"`
	Photo     bool   `json:"photo"`
}

// ConsentRespondCombinedResponse is returned after a combined consent is recorded.
type ConsentRespondCombinedResponse struct {
	Status     string `json:"status"` // "recorded"
	ChildName  string `json:"child_name"`
	ParentName string `json:"parent_name"`
}

// ConsentInfoResponse is the public, stripped payload for a consent token (no
// auth — token is the bearer). It exposes only what a parent needs to recognize
// the request: the child's name, the session name/date/location, and whether the
// token has already been consumed or expired. Parent phone/email stay private.
type ConsentInfoResponse struct {
	Status      string `json:"status"` // "ok" | "consumed" | "invalid" | "expired"
	ChildName   string `json:"child_name,omitempty"`
	ParentName  string `json:"parent_name,omitempty"`
	SessionName string `json:"session_name,omitempty"`
	SessionDate string `json:"session_date,omitempty"`
	Location    string `json:"location,omitempty"`
}
