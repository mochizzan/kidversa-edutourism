package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// CreateUserRequest is the payload for POST /api/users.
type CreateUserRequest struct {
	Email    string          `json:"email" validate:"required,email"`
	Password string          `json:"password" validate:"required,min=6"`
	Name     string          `json:"name" validate:"required"`
	Phone    string          `json:"phone,omitempty"`
	Role     entity.UserRole `json:"role" validate:"required"`
	TenantID string          `json:"tenant_id,omitempty"`
}

// UpdateUserRequest is the payload for PUT /api/users/:id.
type UpdateUserRequest struct {
	Name   string          `json:"name,omitempty"`
	Phone  string          `json:"phone,omitempty"`
	Role   entity.UserRole `json:"role,omitempty"`
	IsActive *bool         `json:"is_active,omitempty"`
}

// RejectUserRequest is the payload for POST /api/users/:id/reject.
type RejectUserRequest struct {
	Reason string `json:"reason,omitempty"`
}

// UserListResponse wraps a paginated user list.
type UserListResponse struct {
	Items []entity.User `json:"items"`
	Total int           `json:"total"`
}

// CreateTenantRequest is the payload for POST /api/tenants.
type CreateTenantRequest struct {
	Name        string `json:"name" validate:"required"`
	Slug        string `json:"slug" validate:"required"`
	SettingsJSON string `json:"settings_json,omitempty"` // raw JSON string passthrough
}

// UpdateTenantRequest is the payload for PUT /api/tenants/:id.
type UpdateTenantRequest struct {
	Name        string `json:"name,omitempty"`
	Slug        string `json:"slug,omitempty"`
	SettingsJSON string `json:"settings_json,omitempty"`
}

// TenantListResponse wraps a paginated tenant list.
type TenantListResponse struct {
	Items []entity.Tenant `json:"items"`
	Total int             `json:"total"`
}
