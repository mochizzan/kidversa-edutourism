package auth

import (
	"context"
	"errors"
	"fmt"
	"log"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

// UserUsecase implements user administration business logic (CRUD + approvals).
// Role gating: SUPER_ADMIN operates globally; ADMIN is scoped to its own tenant.
type UserUsecase struct {
	users      repository.UserRepository
	notif      repository.NotificationRepository
	hub        *sse.Hub
	bcryptCost int
}

// NewUserUsecase builds the user administration usecase. bcryptCost is the
// hashing cost for admin-created user passwords (from config, shared with the
// register/login usecase so all passwords use the same cost). notifRepo + hub
// drive realtime approval notifications (nil is tolerated in tests that never
// create/approve users via this path).
func NewUserUsecase(users repository.UserRepository, notifRepo repository.NotificationRepository, hub *sse.Hub, bcryptCost int) *UserUsecase {
	if bcryptCost < 10 || bcryptCost > 14 {
		bcryptCost = 12
	}
	return &UserUsecase{users: users, notif: notifRepo, hub: hub, bcryptCost: bcryptCost}
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
	hash, err := BcryptHash(password, u.bcryptCost)
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
	u.notifyPendingApproval(ctx, user)
	return user, nil
}

// notifyPendingApproval raises a realtime notification for every approver of the
// new user's tenant. Best-effort: any failure is logged and never fails creation.
func (u *UserUsecase) notifyPendingApproval(ctx context.Context, user *entity.User) {
	if u.notif == nil || u.hub == nil {
		return
	}
	tid := derefStr(user.TenantID)
	approvers, err := u.users.ListApproversForTenant(ctx, tid)
	if err != nil {
		log.Printf("user: resolve approvers failed for tenant %s: %v", tid, err)
		return
	}
	for _, a := range approvers {
		n := &entity.Notification{
			TenantID:        tid,
			RecipientUserID: a.ID,
			Type:            entity.NotifTypeUserPendingApproval,
			RefID:           user.ID,
			Message:         fmt.Sprintf("Pengguna %s menunggu persetujuan", user.Name),
			IsRead:          false,
		}
		if cerr := u.notif.Create(ctx, n); cerr != nil {
			log.Printf("user: create approval notif for %s failed: %v", a.ID, cerr)
			continue
		}
		if perr := u.hub.Publish(ctx, sse.NotifChannel(a.ID), sse.Event{
			Type: entity.EventNotifNew,
			Data: map[string]string{"type": entity.NotifTypeUserPendingApproval, "ref_id": user.ID},
		}); perr != nil {
			log.Printf("user: publish approval notif for %s failed: %v", a.ID, perr)
		}
	}
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
	return u.users.HardDelete(ctx, id)
}

// ApproveUser approves + activates a user (SUPER_ADMIN only at the handler layer).
func (u *UserUsecase) ApproveUser(ctx context.Context, id, approverID string) (*entity.User, error) {
	user, err := u.users.Approve(ctx, id, approverID)
	if err != nil {
		return nil, err
	}
	u.dismissApproval(ctx, id)
	return user, nil
}

// RejectUser rejects a user (SUPER_ADMIN only at the handler layer).
func (u *UserUsecase) RejectUser(ctx context.Context, id, approverID, reason string) (*entity.User, error) {
	user, err := u.users.Reject(ctx, id, approverID, reason)
	if err != nil {
		return nil, err
	}
	u.dismissApproval(ctx, id)
	return user, nil
}

// dismissApproval removes pending-approval notifications for targetUserID and
// publishes an update event to each affected approver. Best-effort.
func (u *UserUsecase) dismissApproval(ctx context.Context, targetUserID string) {
	if u.notif == nil || u.hub == nil {
		return
	}
	recipients, err := u.notif.DeleteByRefAndType(ctx, targetUserID, entity.NotifTypeUserPendingApproval)
	if err != nil {
		log.Printf("user: dismiss approval notif for %s failed: %v", targetUserID, err)
		return
	}
	for _, rid := range recipients {
		if perr := u.hub.Publish(ctx, sse.NotifChannel(rid), sse.Event{
			Type: entity.EventNotifUpdate,
			Data: map[string]string{"type": entity.NotifTypeUserPendingApproval, "ref_id": targetUserID},
		}); perr != nil {
			log.Printf("user: publish dismiss notif for %s failed: %v", rid, perr)
		}
	}
}

// derefStr returns the value of a nullable string, or "" when nil.
func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
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
