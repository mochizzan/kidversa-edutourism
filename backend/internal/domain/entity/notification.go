package entity

// Notification types.
const (
	// NotifTypeUserPendingApproval is raised when a new user registration
	// awaits approval by a tenant approver (SUPER_ADMIN or the tenant's ADMIN).
	NotifTypeUserPendingApproval = "user_pending_approval"
)

// SSE event types on the notif:<userId> channel.
const (
	EventNotifNew    = "notif:new"
	EventNotifUpdate = "notif:update"
)

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
