package auth_test

import (
	"context"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// ---------------------------------------------------------------------------
// fakeUserRepo is an in-memory UserRepository used to exercise UserUsecase
// without a database. Only the methods touched by UpdateUser carry real state;
// the rest are no-ops that satisfy the interface.
// ---------------------------------------------------------------------------

type fakeUserRepo struct {
	users   map[string]*entity.User
	updated *entity.User // last persisted user (nil when Update was never called)
	getErr  error
	updErr  error
}

func (r *fakeUserRepo) Create(context.Context, *entity.User) error { return nil }

func (r *fakeUserRepo) GetByID(_ context.Context, id string) (*entity.User, error) {
	if r.getErr != nil {
		return nil, r.getErr
	}
	if u, ok := r.users[id]; ok {
		clone := *u // return a copy so caller mutations don't leak across calls
		return &clone, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeUserRepo) GetByEmail(context.Context, string) (*entity.User, error) {
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeUserRepo) List(context.Context, repository.UserFilter, int, int) (*repository.Paginated[entity.User], error) {
	return &repository.Paginated[entity.User]{}, nil
}

func (r *fakeUserRepo) Update(_ context.Context, u *entity.User) error {
	if r.updErr != nil {
		return r.updErr
	}
	if r.users == nil {
		r.users = map[string]*entity.User{}
	}
	r.users[u.ID] = u
	cp := *u
	r.updated = &cp
	return nil
}

func (r *fakeUserRepo) Delete(context.Context, string) error     { return nil }
func (r *fakeUserRepo) HardDelete(context.Context, string) error { return nil }
func (r *fakeUserRepo) Approve(context.Context, string, string) (*entity.User, error) {
	return nil, nil
}
func (r *fakeUserRepo) Reject(context.Context, string, string, string) (*entity.User, error) {
	return nil, nil
}
func (r *fakeUserRepo) Deactivate(context.Context, string) (*entity.User, error) { return nil, nil }
func (r *fakeUserRepo) UpdatePassword(context.Context, string, string) error     { return nil }
func (r *fakeUserRepo) ClearMustChangePassword(context.Context, string) error    { return nil }
func (r *fakeUserRepo) ListApproversForTenant(context.Context, string) ([]entity.User, error) {
	return nil, nil
}

func newUserUsecase(repo repository.UserRepository) *auth.UserUsecase {
	return auth.NewUserUsecase(repo, nil, nil, 12)
}

func requireAppErrorCode(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error with code %q, got nil", want)
	}
	_, code, ok := apperrors.AsAppError(err)
	if !ok {
		t.Fatalf("expected app error, got %v", err)
	}
	if code != want {
		t.Fatalf("expected error code %q, got %q", want, code)
	}
}

// TestUpdateUser_SuperAdmin_CannotChangeOwnRole reproduces the self-lockout bug:
// a SUPER_ADMIN may never reassign their own role, otherwise they can demote
// themselves and leave the platform with zero SUPER_ADMIN accounts.
func TestUpdateUser_SuperAdmin_CannotChangeOwnRole(t *testing.T) {
	saID := "superadmin-1"
	repo := &fakeUserRepo{
		users: map[string]*entity.User{
			saID: {
				BaseModel:      entity.BaseModel{ID: saID},
				Email:          "sa@kidversa.test",
				Name:           "Super Admin",
				Role:           entity.RoleSuperAdmin,
				IsActive:       true,
				ApprovalStatus: entity.ApprovalApproved,
			},
		},
	}
	uc := newUserUsecase(repo)

	_, err := uc.UpdateUser(context.Background(), saID, "Super Admin", "",
		entity.RoleAdmin, nil,
		saID, string(entity.RoleSuperAdmin), "")

	requireAppErrorCode(t, err, "self_role_change_not_allowed")

	// The role must NOT have been persisted: Update must never have been called.
	if repo.updated != nil {
		t.Fatalf("role persisted despite self-role-change guard: got role %q", repo.updated.Role)
	}
}

// Any actor (not only SUPER_ADMIN) must be blocked from self role-change.
func TestUpdateUser_Admin_CannotChangeOwnRole(t *testing.T) {
	adminID := "admin-1"
	tenantID := "tenant-1"
	repo := &fakeUserRepo{
		users: map[string]*entity.User{
			adminID: {
				BaseModel:      entity.BaseModel{ID: adminID},
				TenantID:       &tenantID,
				Email:          "admin@kidversa.test",
				Name:           "Admin",
				Role:           entity.RoleAdmin,
				IsActive:       true,
				ApprovalStatus: entity.ApprovalApproved,
			},
		},
	}
	uc := newUserUsecase(repo)

	_, err := uc.UpdateUser(context.Background(), adminID, "Admin", "",
		entity.RoleKoordinator, nil,
		adminID, string(entity.RoleAdmin), tenantID)

	requireAppErrorCode(t, err, "self_role_change_not_allowed")
	if repo.updated != nil {
		t.Fatalf("role persisted despite self-role-change guard: got role %q", repo.updated.Role)
	}
}

// Positive control: SUPER_ADMIN may still re-role a DIFFERENT user. The guard
// must not over-block legitimate cross-user administration.
func TestUpdateUser_SuperAdmin_CanChangeOtherUserRole(t *testing.T) {
	saID := "superadmin-1"
	targetID := "fasilitator-1"
	repo := &fakeUserRepo{
		users: map[string]*entity.User{
			saID:     {BaseModel: entity.BaseModel{ID: saID}, Email: "sa@kidversa.test", Name: "Super Admin", Role: entity.RoleSuperAdmin, IsActive: true, ApprovalStatus: entity.ApprovalApproved},
			targetID: {BaseModel: entity.BaseModel{ID: targetID}, Email: "f@kidversa.test", Name: "Fasilitator", Role: entity.RoleFasilitator, IsActive: true, ApprovalStatus: entity.ApprovalApproved},
		},
	}
	uc := newUserUsecase(repo)

	_, err := uc.UpdateUser(context.Background(), targetID, "Fasilitator", "",
		entity.RoleKoordinator, nil,
		saID, string(entity.RoleSuperAdmin), "")
	if err != nil {
		t.Fatalf("expected success changing another user's role, got %v", err)
	}
	if repo.updated == nil || repo.updated.Role != entity.RoleKoordinator {
		t.Fatalf("expected persisted role KOORDINATOR, got %+v", repo.updated)
	}
}

// Non-role edits to oneself must still work (only the ROLE field is gated,
// so a user can update their own name/phone/avatar).
func TestUpdateUser_Admin_CanUpdateOwnNameWithoutRole(t *testing.T) {
	adminID := "admin-1"
	tenantID := "tenant-1"
	repo := &fakeUserRepo{
		users: map[string]*entity.User{
			adminID: {
				BaseModel:      entity.BaseModel{ID: adminID},
				TenantID:       &tenantID,
				Email:          "admin@kidversa.test",
				Name:           "Old Name",
				Role:           entity.RoleAdmin,
				IsActive:       true,
				ApprovalStatus: entity.ApprovalApproved,
			},
		},
	}
	uc := newUserUsecase(repo)

	_, err := uc.UpdateUser(context.Background(), adminID, "New Name", "",
		"", nil, // role empty -> not a role change
		adminID, string(entity.RoleAdmin), tenantID)
	if err != nil {
		t.Fatalf("expected success updating own name without role, got %v", err)
	}
}
