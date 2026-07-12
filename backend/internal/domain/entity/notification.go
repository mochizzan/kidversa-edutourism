package entity

// Notification is a per-user realtime inbox entry (SSE + list).
type Notification struct {
	BaseModel
	TenantID        string `json:"tenant_id"`
	RecipientUserID string `json:"recipient_user_id"`
	Type            string `json:"type"` // session:live|session:override|system|...
	RefID           string `json:"ref_id,omitempty"`
	Message         string `json:"message,omitempty"`
	IsRead          bool   `json:"is_read"`
}
