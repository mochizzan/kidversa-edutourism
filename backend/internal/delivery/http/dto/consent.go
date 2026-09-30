package dto

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
	Token         string `json:"token" validate:"required"`
	Photo         bool   `json:"photo"`
	ResponderName string `json:"responder_name"`
}

// ConsentRespondCombinedResponse is returned after a combined consent is recorded.
type ConsentRespondCombinedResponse struct {
	Status     string `json:"status"` // "recorded"
	ChildName  string `json:"child_name"`
	ParentName string `json:"parent_name"`
}

// ConsentFlatItem is the read representation of a flat consent row.
type ConsentFlatItem struct {
	ParticipantID string  `json:"participant_id"`
	ChildName     string  `json:"child_name"`
	ParentName    string  `json:"parent_name"`
	ParentPhone   string  `json:"parent_phone"`
	SessionID     string  `json:"session_id"`
	SessionName   string  `json:"session_name"`
	SessionDate   string  `json:"session_date"`
	Location      string  `json:"location"`
	ProgramName   string  `json:"program_name"`
	ConsentStatus string  `json:"consent_status"`
	RespondedAt   *string `json:"responded_at,omitempty"`
	ResponderName string  `json:"responder_name,omitempty"`
	HasToken      bool    `json:"has_token"`
	// DeliveryStatus is the per-participant overlay from the server's in-memory
	// consent batch registry: "queued" | "processing" | "sent" | "failed".
	// Absent (omitempty) when the participant is not part of a retained batch —
	// e.g. right after a server restart, persisted consent_status is the truth.
	DeliveryStatus string `json:"delivery_status,omitempty"`
}

// ConsentActiveBatch is one entry of the flat response's active_batches array:
// a consent WhatsApp batch registered server-side (running or retained).
type ConsentActiveBatch struct {
	BatchID   string `json:"batch_id"`
	SessionID string `json:"session_id"`
	StartedAt string `json:"started_at"` // RFC3339
	Total     int    `json:"total"`
	Sent      int    `json:"sent"`
	Failed    int    `json:"failed"`
}

// ConsentFlatResponse wraps the flat consent list.
type ConsentFlatResponse struct {
	Items []ConsentFlatItem `json:"items"`
	// ActiveBatches is the tenant-filtered list of retained consent batches
	// (newest ~20, oldest evicted). Omitted entirely when idle/restarted.
	ActiveBatches []ConsentActiveBatch `json:"active_batches,omitempty"`
}

// ConsentSendSingleRequest is the payload for POST /api/consent/send-whatsapp/single.
type ConsentSendSingleRequest struct {
	ParticipantID string `json:"participant_id" validate:"required"`
}

// ConsentSendSingleResponse is returned after a single send.
type ConsentSendSingleResponse struct {
	Status string `json:"status"`
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
