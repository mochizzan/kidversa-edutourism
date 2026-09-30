package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// CreateUserRequest is the payload for POST /api/users.
type CreateUserRequest struct {
	Email    string          `json:"email" validate:"required,email"`
	Password string          `json:"password" validate:"required,min=6"`
	Name     string          `json:"name" validate:"required"`
	Phone    string          `json:"phone,omitempty" validate:"omitempty,phone"`
	Role     entity.UserRole `json:"role" validate:"required"`
	TenantID string          `json:"tenant_id,omitempty"`
}

// UpdateUserRequest is the payload for PUT /api/users/:id.
// Partial update: empty values mean "skip" (mirrored by GORM struct Updates,
// which also skips zero values — see AGENTS.md partial-update convention).
type UpdateUserRequest struct {
	Name     string          `json:"name,omitempty" validate:"omitempty,min=2,max=50"`
	Email    string          `json:"email,omitempty" validate:"omitempty,email"`
	Phone    string          `json:"phone,omitempty" validate:"omitempty,phone"`
	Role     entity.UserRole `json:"role,omitempty"`
	IsActive *bool           `json:"is_active,omitempty"`
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

// TenantListResponse wraps a paginated tenant list.
type TenantListResponse struct {
	Items []entity.Tenant `json:"items"`
	Total int             `json:"total"`
}

// PublicTenantResponse is the minimal tenant projection exposed on the
// public (unauthenticated) register endpoint. It intentionally omits
// settings_json and audit fields so anonymous callers cannot read tenant
// configuration.
type PublicTenantResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}
