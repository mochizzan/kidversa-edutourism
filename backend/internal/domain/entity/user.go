package entity

// User is a platform account. password_hash is never serialized to clients.
type User struct {
	BaseModel
	TenantID        *string      `json:"tenant_id,omitempty"`
	Email           string       `json:"email"`
	PasswordHash    string       `json:"-"`
	Name            string       `json:"name"`
	Phone           string       `json:"phone,omitempty"`
	AvatarURL       string       `json:"avatar_url,omitempty"`
	Role            UserRole     `json:"role"`
	IsActive        bool         `json:"is_active"`
	ApprovalStatus  ApprovalStatus `json:"approval_status"`
	ApprovedAt      *string  `json:"approved_at,omitempty"`
	ApprovedBy      *string  `json:"approved_by,omitempty"`
	RejectedAt      *string  `json:"rejected_at,omitempty"`
	RejectedBy      *string  `json:"rejected_by,omitempty"`
	RejectionReason string       `json:"rejection_reason,omitempty"`
	MustChangePassword bool      `json:"must_change_password,omitempty"`
}

// Tenant is a customer organization (multi-tenant root).
type Tenant struct {
	BaseModel
	Name         string  `json:"name"`
	Slug         string  `json:"slug"`
	SettingsJSON RawJSON `json:"settings_json,omitempty"`
}
