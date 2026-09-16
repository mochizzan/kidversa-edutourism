package repository

import (
	"context"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ConsentRepository manages consent decisions (read for media scoping, write for responses).
type ConsentRepository interface {
	// GetConsentValue returns the current consent value (true=granted) for a participant in a
	// session for the given consent type. Returns false when no record exists.
	GetConsentValue(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) (bool, error)
	// RespondConsent records a parent's consent decision, upserting the latest value.
	RespondConsent(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType, value bool, ip, ua, responderName string) error
	// ListConsentsByParticipant returns all consent rows for a participant.
	ListConsentsByParticipant(ctx context.Context, participantID string) ([]entity.ConsentLog, error)
	// ListConsentsBySession returns all consent rows for a session.
	ListConsentsBySession(ctx context.Context, sessionID string) ([]entity.ConsentLog, error)
	// ListConsentsBySessionIDs returns all consent rows for multiple sessions in a single query, grouped by session_id.
	ListConsentsBySessionIDs(ctx context.Context, sessionIDs []string) (map[string][]entity.ConsentLog, error)
	// GetParticipantByConsentToken resolves a participant by their active combined consent
	// token (WhatsApp delivery flow). Returns nil when not found.
	GetParticipantByConsentToken(ctx context.Context, token string) (*entity.Participant, error)
	// SendConsentRequest records that a consent request was sent (audit trail).
	// Creates a consent_logs row with sent_at=now and responded_at=NULL.
	// If a row already exists for this (participant, session, type), it updates sent_at.
	SendConsentRequest(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) error
	// ListConsentFlat returns a flat projection joining participants, sessions, and consent_logs.
	ListConsentFlat(ctx context.Context, tenantID string) ([]ConsentFlatRow, error)
}

// ConsentFlatRow is a flat projection joining participants, sessions, and consent_logs.
type ConsentFlatRow struct {
	ParticipantID string     `json:"participant_id"`
	ChildName     string     `json:"child_name"`
	ParentName    string     `json:"parent_name"`
	ParentPhone   string     `json:"parent_phone"`
	SessionID     string     `json:"session_id"`
	SessionName   string     `json:"session_name"`
	SessionDate   string     `json:"session_date"`
	Location      string     `json:"location"`
	ProgramName   string     `json:"program_name"`
	ConsentStatus string     `json:"consent_status"`
	RespondedAt   *time.Time `json:"responded_at,omitempty"`
	ResponderName string     `json:"responder_name,omitempty"`
	HasToken      bool       `json:"has_token"`
}
