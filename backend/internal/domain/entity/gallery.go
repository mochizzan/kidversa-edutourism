package entity

import "time"

// GalleryToken stores a public-access token that lets parents view a child's
// session photos via a QR code on the printed rapor.  The raw token is never
// serialised (json:"-"); callers see only the opaque string in API responses.
type GalleryToken struct {
	BaseModel
	ReportID      string    `json:"report_id"`
	ParticipantID string    `json:"participant_id"`
	SessionID     string    `json:"session_id"`
	TenantID      string    `json:"tenant_id"`
	Token         string    `json:"-"`
	ExpiresAt     time.Time `json:"expires_at"`
	Revoked       bool      `json:"revoked"`
}
