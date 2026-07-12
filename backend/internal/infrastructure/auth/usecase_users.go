package auth

import (
	"context"
	"errors"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// defaultBcryptCost is used when hashing passwords created via the admin user usecase.
const defaultBcryptCost = 10

// UserUsecase implements user administration business logic (CRUD + approvals).
// Role gating: SUPER_ADMIN operates globally; ADMIN is scoped to its own tenant.
type UserUsecase struct {
	users repository.UserRepository
}

// NewUserUsecase builds the user administration usecase.
func NewUserUsecase(users repository.UserRepository) *UserUsecase {
	return &UserUsecase{users: users}
}

// CreateUser creates a new (pending, inactive) user. ADMIN is forced to its own tenant.
func (u *UserUsecase) CreateUser(ctx context.Context, email, password, name, phone, tenantID string, role entity.UserRole, actorRole string, actorTenantID string) (*entity.User, error) {
	if actorRole != string(entity.RoleSuperAdmin) {
		// Non-SA admins cannot assign users to other tenants.
		tenantID = actorTenantID
	}
	if role == "" {
		role = entity.RoleFasilitator
	}
	if !role.Valid() {
		return nil, apperrors.BadRequest("validation_error", errors.New("invalid role"))
	}
	hash, err := BcryptHash(password, defaultBcryptCost)
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var tid *string
	if tenantID != "" {
		tid = &tenantID
	}
	user := &entity.User{
		TenantID:       tid,
		Email:          email,
		PasswordHash:   hash,
		Name:           name,
		Phone:          phone,
		Role:           role,
		IsActive:       false,
		ApprovalStatus: entity.ApprovalPending,
	}
	if err := u.users.Create(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

// ListUsers returns a filtered, paginated list. ADMIN is scoped to its own tenant.
func (u *UserUsecase) ListUsers(ctx context.Context, f repository.UserFilter, page, limit int, actorRole string, actorTenantID string) (*repository.Paginated[entity.User], error) {
	if actorRole != string(entity.RoleSuperAdmin) {
		f.TenantID = actorTenantID
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	return u.users.List(ctx, f, page, limit)
}

// GetUser fetches a single user, enforcing tenant scope for ADMIN.
func (u *UserUsecase) GetUser(ctx context.Context, id, actorRole, actorTenantID string) (*entity.User, error) {
	user, err := u.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if actorRole != string(entity.RoleSuperAdmin) && !sameTenant(user.TenantID, actorTenantID) {
		return nil, apperrors.Forbidden("forbidden", errors.New("cross-tenant access"))
	}
	return user, nil
}

// UpdateUser updates mutable user fields, enforcing tenant scope for ADMIN.
func (u *UserUsecase) UpdateUser(ctx context.Context, id, name, phone string, role entity.UserRole, isActive *bool, actorRole, actorTenantID string) (*entity.User, error) {
	user, err := u.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if actorRole != string(entity.RoleSuperAdmin) && !sameTenant(user.TenantID, actorTenantID) {
		return nil, apperrors.Forbidden("forbidden", errors.New("cross-tenant access"))
	}
	if name != "" {
		user.Name = name
	}
	if phone != "" {
		user.Phone = phone
	}
	if role != "" {
		if !role.Valid() {
			return nil, apperrors.BadRequest("validation_error", errors.New("invalid role"))
		}
		user.Role = role
	}
	if isActive != nil {
		user.IsActive = *isActive
	}
	if err := u.users.Update(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

// DeleteUser removes a user, enforcing tenant scope for ADMIN.
func (u *UserUsecase) DeleteUser(ctx context.Context, id, actorRole, actorTenantID string) error {
	if actorRole != string(entity.RoleSuperAdmin) {
		user, err := u.users.GetByID(ctx, id)
		if err != nil {
			return err
		}
		if !sameTenant(user.TenantID, actorTenantID) {
			return apperrors.Forbidden("forbidden", errors.New("cross-tenant access"))
		}
	}
	return u.users.Delete(ctx, id)
}

// ApproveUser approves + activates a user (SUPER_ADMIN only at the handler layer).
func (u *UserUsecase) ApproveUser(ctx context.Context, id, approverID string) (*entity.User, error) {
	return u.users.Approve(ctx, id, approverID)
}

// RejectUser rejects a user (SUPER_ADMIN only at the handler layer).
func (u *UserUsecase) RejectUser(ctx context.Context, id, approverID, reason string) (*entity.User, error) {
	return u.users.Reject(ctx, id, approverID, reason)
}

// DeactivateUser deactivates a user (SUPER_ADMIN only at the handler layer).
func (u *UserUsecase) DeactivateUser(ctx context.Context, id string) (*entity.User, error) {
	return u.users.Deactivate(ctx, id)
}

// sameTenant compares a nullable user tenant against the actor tenant.
// A nil/empty user tenant never matches a non-empty actor tenant.
func sameTenant(userTenant *string, actorTenant string) bool {
	if actorTenant == "" {
		return true
	}
	if userTenant == nil {
		return false
	}
	return *userTenant == actorTenant
}
