package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// LoginRequest is the payload for POST /api/auth/login.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
}

// RegisterRequest is the payload for POST /api/auth/register.
type RegisterRequest struct {
	Email    string          `json:"email" validate:"required,email"`
	Password string          `json:"password" validate:"required,min=6"`
	Name     string          `json:"name" validate:"required"`
	Phone    string          `json:"phone,omitempty"`
	TenantID string          `json:"tenant_id,omitempty"`
	Role     entity.UserRole `json:"role,omitempty"`
}

// RefreshRequest is the payload for POST /api/auth/refresh.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

// ChangePasswordRequest is the payload for POST /api/auth/change-password.
type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" validate:"required"`
	NewPassword string `json:"new_password" validate:"required,min=6"`
}

// KioskTokenRequest requests a kiosk token for a session.
type KioskTokenRequest struct {
	SessionID string `json:"session_id" validate:"required"`
}

// ParentTokenRequest requests a parent report token.
type ParentTokenRequest struct {
	ReportID string `json:"report_id" validate:"required"`
}

// LoginResponse is returned by login/refresh.
type LoginResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	User         *entity.User `json:"user"`
}

// MeResponse wraps the current user.
type MeResponse struct {
	User *entity.User `json:"user"`
}
