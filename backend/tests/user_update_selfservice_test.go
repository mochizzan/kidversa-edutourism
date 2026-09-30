package auth_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// ---------------------------------------------------------------------------
// profileUpdateRepo is an in-memory UserRepository for the PUT /api/users/:id
// self-service tests. It records every Update write (so tests can prove what
// the usecase persisted) and implements GetByEmail with the SAME lower-case
// normalization the GORM repo applies (user_repo.go).
// ---------------------------------------------------------------------------

type profileUpdateRepo struct {
	users       map[string]*entity.User
	updated     *entity.User // last persisted user (nil until Update runs)
	updateCalls int
	getByEmail  map[string]*entity.User // pre-seeded extra rows for uniqueness checks
}

func newProfileUpdateRepo(users ...*entity.User) *profileUpdateRepo {
	r := &profileUpdateRepo{
		users:      map[string]*entity.User{},
		getByEmail: map[string]*entity.User{},
	}
	for _, u := range users {
		r.users[u.ID] = u
	}
	return r
}

func (r *profileUpdateRepo) Create(context.Context, *entity.User) error { return nil }

func (r *profileUpdateRepo) GetByID(_ context.Context, id string) (*entity.User, error) {
	if u, ok := r.users[id]; ok {
		clone := *u
		return &clone, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *profileUpdateRepo) GetByEmail(_ context.Context, email string) (*entity.User, error) {
	want := strings.ToLower(email)
	for _, u := range r.users {
		if strings.ToLower(u.Email) == want {
			clone := *u
			return &clone, nil
		}
	}
	for _, u := range r.getByEmail {
		if strings.ToLower(u.Email) == want {
			clone := *u
			return &clone, nil
		}
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *profileUpdateRepo) List(context.Context, repository.UserFilter, int, int) (*repository.Paginated[entity.User], error) {
	return &repository.Paginated[entity.User]{}, nil
}

func (r *profileUpdateRepo) Update(_ context.Context, u *entity.User) error {
	r.updateCalls++
	clone := *u
	r.updated = &clone
	r.users[u.ID] = &clone
	return nil
}

func (r *profileUpdateRepo) Delete(context.Context, string) error     { return nil }
func (r *profileUpdateRepo) HardDelete(context.Context, string) error { return nil }
func (r *profileUpdateRepo) Approve(context.Context, string, string) (*entity.User, error) {
	return nil, nil
}
func (r *profileUpdateRepo) Reject(context.Context, string, string, string) (*entity.User, error) {
	return nil, nil
}
func (r *profileUpdateRepo) Deactivate(context.Context, string) (*entity.User, error) {
	return nil, nil
}
func (r *profileUpdateRepo) UpdatePassword(context.Context, string, string) error { return nil }
func (r *profileUpdateRepo) ClearMustChangePassword(context.Context, string) error {
	return nil
}
func (r *profileUpdateRepo) ListApproversForTenant(context.Context, string) ([]entity.User, error) {
	return nil, nil
}

const (
	profileActorID   = "11111111-1111-4111-8111-111111111111"
	profileTargetID  = "22222222-2222-4222-8222-222222222222"
	profileOtherID   = "33333333-3333-4333-8333-333333333333"
	profileTenantID  = "tenant-1"
	profileEmail     = "fasilitator@kidversa.test"
	profileOtherMail = "taken@kidversa.test"
)

func newProfileUser(id, name, email string, role entity.UserRole) *entity.User {
	tid := profileTenantID
	return &entity.User{
		BaseModel:      entity.BaseModel{ID: id},
		TenantID:       &tid,
		Email:          email,
		Name:           name,
		Role:           role,
		IsActive:       true,
		ApprovalStatus: entity.ApprovalApproved,
	}
}

func newProfileHandler(repo repository.UserRepository) (*handler.UserHandler, *echo.Echo) {
	e := echo.New()
	e.Validator = appmiddleware.NewValidator() // same validator the router installs
	uc := auth.NewUserUsecase(repo, nil, nil, 12)
	return handler.NewUserHandler(uc, nil, nil), e
}

// putProfile issues PUT /api/users/:id directly against the handler with the
// middleware context (user id / role / tenant) already resolved, mirroring
// what JWTAuth + TenantScope set in production. A returned AppError is mapped
// through the global ErrorHandler, so rec.Code reflects the real HTTP status
// the client would see.
func putProfile(t *testing.T, h *handler.UserHandler, e *echo.Echo, targetID, actorID, actorRole, body string) (*httptest.ResponseRecorder, error) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/users/"+targetID, strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: targetID}})
	c.Set(appmiddleware.CtxUserID, actorID)
	c.Set(appmiddleware.CtxRole, actorRole)
	c.Set(appmiddleware.CtxTenantID, profileTenantID)
	err := h.Update(c)
	if err != nil {
		appmiddleware.ErrorHandler(c, err)
	}
	return rec, err
}

// requireStatus asserts err is an AppError carrying the wanted HTTP status.
func requireStatus(t *testing.T, err error, wantStatus int, wantCode string) {
	t.Helper()
	status, code, ok := apperrors.AsAppError(err)
	if !ok {
		t.Fatalf("expected AppError with status %d code %q, got %v", wantStatus, wantCode, err)
	}
	if status != wantStatus || code != wantCode {
		t.Fatalf("expected %d %q, got %d %q", wantStatus, wantCode, status, code)
	}
}

// TestUpdate_SelfService_Fasilitator: with the route role gate removed, a
// FASILITATOR updating their OWN name/email/phone succeeds (200) and every
// provided field reaches the repository write.
func TestUpdate_SelfService_Fasilitator(t *testing.T) {
	repo := newProfileUpdateRepo(newProfileUser(profileActorID, "Nama Lama", profileEmail, entity.RoleFasilitator))
	h, e := newProfileHandler(repo)

	body := `{"name":"Nama Baru","email":"Baru@Kidversa.Test","phone":"+628123456789"}`
	rec, err := putProfile(t, h, e, profileActorID, profileActorID, string(entity.RoleFasilitator), body)
	if err != nil {
		t.Fatalf("self-update returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if repo.updateCalls != 1 || repo.updated == nil {
		t.Fatalf("expected exactly one repository write, got %d", repo.updateCalls)
	}
	if repo.updated.Name != "Nama Baru" {
		t.Fatalf("name not persisted: %+v", repo.updated)
	}
	if repo.updated.Email != "baru@kidversa.test" {
		t.Fatalf("email not persisted lower-cased: %q", repo.updated.Email)
	}
	if repo.updated.Phone != "+628123456789" {
		t.Fatalf("phone not persisted: %q", repo.updated.Phone)
	}
	if repo.updated.Role != entity.RoleFasilitator {
		t.Fatalf("role must be untouched on self-update, got %q", repo.updated.Role)
	}
}

// TestUpdate_NonAdmin_CannotUpdateOtherUser: the removed route gate must not
// open cross-user writes — a FASILITATOR touching ANOTHER account is 403.
func TestUpdate_NonAdmin_CannotUpdateOtherUser(t *testing.T) {
	repo := newProfileUpdateRepo(
		newProfileUser(profileActorID, "Fasilitator", profileEmail, entity.RoleFasilitator),
		newProfileUser(profileTargetID, "Target", "target@kidversa.test", entity.RoleFasilitator),
	)
	h, e := newProfileHandler(repo)

	rec, err := putProfile(t, h, e, profileTargetID, profileActorID, string(entity.RoleFasilitator),
		`{"name":"Hacked Name"}`)
	requireStatus(t, err, http.StatusForbidden, "forbidden")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"code":"forbidden"`) {
		t.Fatalf("expected forbidden envelope, got: %s", rec.Body.String())
	}
	if repo.updateCalls != 0 {
		t.Fatalf("repository write happened despite 403")
	}
}

// TestUpdate_SelfCannotChangePrivilegeFields: role and is_active changes on
// one's own account are server-side rejected with 403 — no privilege escalation.
func TestUpdate_SelfCannotChangePrivilegeFields(t *testing.T) {
	t.Run("role", func(t *testing.T) {
		repo := newProfileUpdateRepo(newProfileUser(profileActorID, "Fasilitator", profileEmail, entity.RoleFasilitator))
		h, e := newProfileHandler(repo)

		_, err := putProfile(t, h, e, profileActorID, profileActorID, string(entity.RoleFasilitator),
			`{"role":"ADMIN"}`)
		requireStatus(t, err, http.StatusForbidden, "self_role_change_not_allowed")
		if repo.updateCalls != 0 {
			t.Fatalf("repository write happened despite self role-change 403")
		}
	})

	t.Run("is_active", func(t *testing.T) {
		repo := newProfileUpdateRepo(newProfileUser(profileActorID, "Fasilitator", profileEmail, entity.RoleFasilitator))
		h, e := newProfileHandler(repo)

		rec, err := putProfile(t, h, e, profileActorID, profileActorID, string(entity.RoleFasilitator),
			`{"is_active":false}`)
		requireStatus(t, err, http.StatusForbidden, "forbidden")
		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
		}
		if repo.updateCalls != 0 {
			t.Fatalf("repository write happened despite self is_active 403")
		}
	})
}

// TestUpdate_EmailConflict: uq_users_email is enforced server-side — taking a
// different row's address fails with 409 conflict (case-insensitively), while
// re-sending one's own address (different case) is a no-op success.
func TestUpdate_EmailConflict(t *testing.T) {
	other := newProfileUser(profileOtherID, "Taken", profileOtherMail, entity.RoleFasilitator)

	t.Run("other row owns the address", func(t *testing.T) {
		repo := newProfileUpdateRepo(
			newProfileUser(profileActorID, "Fasilitator", profileEmail, entity.RoleFasilitator),
			other,
		)
		h, e := newProfileHandler(repo)

		rec, err := putProfile(t, h, e, profileActorID, profileActorID, string(entity.RoleFasilitator),
			`{"email":"TAKEN@Kidversa.Test"}`)
		requireStatus(t, err, http.StatusConflict, "conflict")
		if rec.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), `"code":"conflict"`) {
			t.Fatalf("expected conflict envelope, got: %s", rec.Body.String())
		}
		if repo.updateCalls != 0 {
			t.Fatalf("repository write happened despite 409")
		}
	})

	t.Run("own address is excluded", func(t *testing.T) {
		repo := newProfileUpdateRepo(
			newProfileUser(profileActorID, "Fasilitator", profileEmail, entity.RoleFasilitator),
			other,
		)
		h, e := newProfileHandler(repo)

		rec, err := putProfile(t, h, e, profileActorID, profileActorID, string(entity.RoleFasilitator),
			`{"email":"Fasilitator@Kidversa.Test"}`)
		if err != nil {
			t.Fatalf("re-sending own email must succeed, got %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

// TestUpdate_InvalidBody: bindAndValidate writes the 400 itself and returns
// nil — the handler must stop there. An invalid body (short name / bad email /
// malformed JSON) yields 400 and NEVER reaches the usecase.
func TestUpdate_InvalidBody(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{"short name", `{"name":"a"}`},
		{"bad email", `{"email":"not-an-email"}`},
		{"bad phone", `{"phone":"abc"}`},
		{"malformed json", `{"name":`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newProfileUpdateRepo(newProfileUser(profileActorID, "Fasilitator", profileEmail, entity.RoleFasilitator))
			h, e := newProfileHandler(repo)

			rec, err := putProfile(t, h, e, profileActorID, profileActorID, string(entity.RoleFasilitator), tc.body)
			if err != nil {
				t.Fatalf("handler must swallow the already-written 400, got %v", err)
			}
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
			}
			if !strings.Contains(rec.Body.String(), "error") {
				t.Fatalf("expected error envelope, got: %s", rec.Body.String())
			}
			if repo.updateCalls != 0 {
				t.Fatalf("invalid body reached the repository (%d writes)", repo.updateCalls)
			}
		})
	}
}

// TestUpdate_Admin_OtherUserWithEmail: positive control — an ADMIN updating a
// different user (role-gated path) still persists the new email.
func TestUpdate_Admin_OtherUserWithEmail(t *testing.T) {
	repo := newProfileUpdateRepo(
		newProfileUser(profileActorID, "Admin", "admin@kidversa.test", entity.RoleAdmin),
		newProfileUser(profileTargetID, "Target", "target@kidversa.test", entity.RoleFasilitator),
	)
	h, e := newProfileHandler(repo)

	rec, err := putProfile(t, h, e, profileTargetID, profileActorID, string(entity.RoleAdmin),
		`{"name":"Target Baru","email":"baru@kidversa.test"}`)
	if err != nil {
		t.Fatalf("admin cross-user update returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if repo.updated == nil || repo.updated.Email != "baru@kidversa.test" {
		t.Fatalf("expected persisted email, got %+v", repo.updated)
	}
}

// TestUpdateUser_PersistsNormalizedEmail is the usecase-level proof that the
// email argument is written (lower-cased) and that a collision with another
// row is reported as 409 before any storage write.
func TestUpdateUser_PersistsNormalizedEmail(t *testing.T) {
	repo := newProfileUpdateRepo(newProfileUser(profileActorID, "Fasilitator", profileEmail, entity.RoleFasilitator))
	uc := auth.NewUserUsecase(repo, nil, nil, 12)

	u, err := uc.UpdateUser(context.Background(), profileActorID,
		"", "New.Mail@Kidversa.Test", "",
		"", nil,
		profileActorID, string(entity.RoleFasilitator), profileTenantID)
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if u.Email != "new.mail@kidversa.test" {
		t.Fatalf("returned email not normalized: %q", u.Email)
	}
	if repo.updated == nil || repo.updated.Email != "new.mail@kidversa.test" {
		t.Fatalf("email not persisted by repo write: %+v", repo.updated)
	}

	// Collision with ANOTHER row → 409 conflict, nothing written.
	repo2 := newProfileUpdateRepo(
		newProfileUser(profileActorID, "Fasilitator", profileEmail, entity.RoleFasilitator),
		newProfileUser(profileOtherID, "Taken", profileOtherMail, entity.RoleFasilitator),
	)
	uc2 := auth.NewUserUsecase(repo2, nil, nil, 12)
	_, err = uc2.UpdateUser(context.Background(), profileActorID,
		"", profileOtherMail, "",
		"", nil,
		profileActorID, string(entity.RoleFasilitator), profileTenantID)
	requireAppErrorCode(t, err, "conflict")
	if repo2.updateCalls != 0 {
		t.Fatalf("conflict must not write")
	}
}
