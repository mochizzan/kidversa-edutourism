package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// UserFilter narrows a user list query.
type UserFilter struct {
	TenantID       string
	Role           string
	ApprovalStatus string
	IsActive       *bool
	Search         string
}

// Paginated is the generic list result.
type Paginated[T any] struct {
	Items []T `json:"items"`
	Total int `json:"total"`
}

// UserRepository is the persistence contract for users.
type UserRepository interface {
	Create(ctx context.Context, u *entity.User) error
	GetByID(ctx context.Context, id string) (*entity.User, error)
	GetByEmail(ctx context.Context, email string) (*entity.User, error)
	List(ctx context.Context, f UserFilter, page, limit int) (*Paginated[entity.User], error)
	Update(ctx context.Context, u *entity.User) error
	Delete(ctx context.Context, id string) error

	// HardDelete permanently removes a user row (ignores soft-delete scope).
	// Used for irreversible SUPER_ADMIN user removal.
	HardDelete(ctx context.Context, id string) error

	// Approve marks a user approved and active.
	Approve(ctx context.Context, id, approverID string) (*entity.User, error)
	// Reject marks a user rejected (inactive).
	Reject(ctx context.Context, id, approverID, reason string) (*entity.User, error)
	// Deactivate flips a user's is_active to false (no approval change).
	Deactivate(ctx context.Context, id string) (*entity.User, error)
}
