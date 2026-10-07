package auth_test

// AR-4 (F-A-008) regression: ChangePassword must revoke ALL sessions
// (refresh family + current access jti) and clear both cookies.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// chgPwUserRepo records password writes for the AR-4 tests.
type chgPwUserRepo struct {
	user        *entity.User
	updateHash  string
	updateCalls int
	clearCalls  int
}

func (r *chgPwUserRepo) Create(context.Context, *entity.User) error { return nil }
func (r *chgPwUserRepo) GetByID(_ context.Context, id string) (*entity.User, error) {
	if r.user != nil && r.user.ID == id {
		clone := *r.user
		return &clone, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}
func (r *chgPwUserRepo) GetByEmail(context.Context, string) (*entity.User, error) {
	return nil, apperrors.NotFound("not_found", nil)
}
func (r *chgPwUserRepo) List(context.Context, repository.UserFilter, int, int) (*repository.Paginated[entity.User], error) {
	return &repository.Paginated[entity.User]{}, nil
}
func (r *chgPwUserRepo) Update(context.Context, *entity.User) error { return nil }
func (r *chgPwUserRepo) Delete(context.Context, string) error       { return nil }
func (r *chgPwUserRepo) HardDelete(context.Context, string) error   { return nil }
func (r *chgPwUserRepo) Approve(context.Context, string, string) (*entity.User, error) {
	return nil, nil
}
func (r *chgPwUserRepo) Reject(context.Context, string, string, string) (*entity.User, error) {
	return nil, nil
}
func (r *chgPwUserRepo) Deactivate(context.Context, string) (*entity.User, error) {
	return nil, nil
}
func (r *chgPwUserRepo) UpdatePassword(_ context.Context, id, hash string) error {
	r.updateCalls++
	r.updateHash = hash
	return nil
}
func (r *chgPwUserRepo) ClearMustChangePassword(context.Context, string) error {
	r.clearCalls++
	return nil
}
func (r *chgPwUserRepo) ListApproversForTenant(context.Context, string) ([]entity.User, error) {
	return nil, nil
}

// chgPwRefreshStore records family revocations for the AR-4 tests.
type chgPwRefreshStore struct {
	revokeAllCalls []string
	revokeAllErr   error
}

func (s *chgPwRefreshStore) Create(context.Context, string, string, time.Time) error {
	return nil
}
func (s *chgPwRefreshStore) Revoke(context.Context, string) error { return nil }
func (s *chgPwRefreshStore) RevokeAllForUser(_ context.Context, userID string) error {
	s.revokeAllCalls = append(s.revokeAllCalls, userID)
	return s.revokeAllErr
}
func (s *chgPwRefreshStore) GetByHash(context.Context, string) (*auth.RefreshRecord, error) {
	return nil, apperrors.Unauthorized("token_invalid", errors.New("no record"))
}
func (s *chgPwRefreshStore) GetByHashForUpdate(context.Context, string) (*auth.RefreshRecord, error) {
	return nil, apperrors.Unauthorized("token_invalid", errors.New("no record"))
}
func (s *chgPwRefreshStore) Transaction(_ context.Context, fn func(auth.RefreshStore) error) error {
	return fn(s)
}
func (s *chgPwRefreshStore) CleanExpired(context.Context, time.Time) (int64, error) {
	return 0, nil
}
func (s *chgPwRefreshStore) StartCleanup(context.Context, time.Duration, time.Duration) func() {
	return func() {}
}

func chgPwTestJWT() *auth.JWTManager {
	return auth.NewJWTManager(&config.Config{
		JWTSecret:     "ar4-test-secret",
		JWTAccessTTL:  15 * time.Minute,
		JWTRefreshTTL: time.Hour,
	})
}

func chgPwSeedUser(t *testing.T) *chgPwUserRepo {
	t.Helper()
	hash, err := auth.BcryptHash("old-pass-123", 4)
	if err != nil {
		t.Fatalf("seed bcrypt: %v", err)
	}
	return &chgPwUserRepo{user: &entity.User{
		BaseModel:      entity.BaseModel{ID: "user-ar4"},
		Email:          "ar4@kidversa.test",
		PasswordHash:   hash,
		Role:           entity.RoleFasilitator,
		IsActive:       true,
		ApprovalStatus: entity.ApprovalApproved,
	}}
}

// Change OK: family revoked for the user AND current jti denylisted.
func TestChangePassword_RevokesFamilyAndCurrentJTI(t *testing.T) {
	users := chgPwSeedUser(t)
	store := &chgPwRefreshStore{}
	revoker := auth.NewInMemoryRevoker()
	t.Cleanup(revoker.Stop)
	uc := auth.NewUsecase(users, chgPwTestJWT(), revoker, store, 4)

	if err := uc.ChangePassword(context.Background(), "user-ar4", "old-pass-123", "new-pass-456", "jti-ar4", 15*time.Minute); err != nil {
		t.Fatalf("ChangePassword: %v", err)
	}
	if len(store.revokeAllCalls) != 1 || store.revokeAllCalls[0] != "user-ar4" {
		t.Errorf("RevokeAllForUser calls = %v, want [user-ar4]", store.revokeAllCalls)
	}
	if !revoker.IsRevoked(context.Background(), "jti-ar4") {
		t.Error("current jti not denylisted")
	}
	if users.updateCalls != 1 || users.clearCalls != 1 {
		t.Errorf("updateCalls=%d clearCalls=%d, want 1/1", users.updateCalls, users.clearCalls)
	}
}

// Wrong old password: NO revoke calls at all (password untouched).
func TestChangePassword_WrongOld_NoRevokes(t *testing.T) {
	users := chgPwSeedUser(t)
	store := &chgPwRefreshStore{}
	revoker := auth.NewInMemoryRevoker()
	t.Cleanup(revoker.Stop)
	uc := auth.NewUsecase(users, chgPwTestJWT(), revoker, store, 4)

	err := uc.ChangePassword(context.Background(), "user-ar4", "wrong-old", "new-pass-456", "jti-ar4", 15*time.Minute)
	if _, code, ok := apperrors.AsAppError(err); !ok || code != "invalid_credentials" {
		t.Fatalf("expected invalid_credentials, got %v", err)
	}
	if len(store.revokeAllCalls) != 0 {
		t.Errorf("RevokeAllForUser calls = %v, want none", store.revokeAllCalls)
	}
	if revoker.IsRevoked(context.Background(), "jti-ar4") {
		t.Error("jti denylisted despite failed change")
	}
	if users.updateCalls != 0 {
		t.Errorf("password updated despite wrong old password")
	}
}

// Revoke failure: password IS already changed (documented), error is internal_error.
func TestChangePassword_RevokeError_PasswordStillChanged(t *testing.T) {
	users := chgPwSeedUser(t)
	store := &chgPwRefreshStore{revokeAllErr: errors.New("db down")}
	revoker := auth.NewInMemoryRevoker()
	t.Cleanup(revoker.Stop)
	uc := auth.NewUsecase(users, chgPwTestJWT(), revoker, store, 4)

	err := uc.ChangePassword(context.Background(), "user-ar4", "old-pass-123", "new-pass-456", "jti-ar4", 15*time.Minute)
	if _, code, ok := apperrors.AsAppError(err); !ok || code != "internal_error" {
		t.Fatalf("expected internal_error, got %v", err)
	}
	if users.updateCalls != 1 {
		t.Error("password must already be changed when revocation fails (fail closed on response, not on write)")
	}
}

// Handler: 200 + BOTH cookies cleared + jti denylisted; missing refresh
// cookie is tolerated (no 401 — family revoke covers it).
func TestChangePasswordHandler_ClearsCookiesAndDenylists(t *testing.T) {
	run := func(t *testing.T, withRefreshCookie bool) (*httptest.ResponseRecorder, *auth.InMemoryRevoker) {
		t.Helper()
		users := chgPwSeedUser(t)
		store := &chgPwRefreshStore{}
		revoker := auth.NewInMemoryRevoker()
		t.Cleanup(revoker.Stop)
		jm := chgPwTestJWT()
		h := handler.NewAuthHandler(auth.NewUsecase(users, jm, revoker, store, 4), jm, "sess-ar4", "refr-ar4", false, "Lax")

		e := echo.New()
		e.Validator = appmiddleware.NewValidator()
		req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password",
			strings.NewReader(`{"old_password":"old-pass-123","new_password":"new-pass-456"}`))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		if withRefreshCookie {
			req.AddCookie(&http.Cookie{Name: "refr-ar4", Value: "stale-refresh-token"})
		}
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.Set(appmiddleware.CtxUserID, "user-ar4")
		c.Set(appmiddleware.CtxClaims, &auth.Claims{
			UserID:           "user-ar4",
			RegisteredClaims: jwt.RegisteredClaims{ID: "jti-handler-ar4"},
		})
		if err := h.ChangePassword(c); err != nil {
			t.Fatalf("ChangePassword handler: %v", err)
		}
		if len(store.revokeAllCalls) != 1 {
			t.Fatalf("RevokeAllForUser calls = %v, want 1", store.revokeAllCalls)
		}
		return rec, revoker
	}

	for _, withCookie := range []bool{true, false} {
		name := "with-cookie"
		if !withCookie {
			name = "cookie-absent"
		}
		t.Run(name, func(t *testing.T) {
			rec, revoker := run(t, withCookie)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
			}
			cleared := map[string]bool{}
			for _, h := range rec.Header().Values("Set-Cookie") {
				// Wire form: "sess-ar4=; Path=/; Max-Age=0; HttpOnly; Secure".
				// MaxAge=-1 serializes as Max-Age=0 (immediate expiry).
				for _, name := range []string{"sess-ar4", "refr-ar4"} {
					if strings.HasPrefix(h, name+"=;") && strings.Contains(h, "Max-Age=0") {
						cleared[name] = true
					}
				}
			}
			if !cleared["sess-ar4"] || !cleared["refr-ar4"] {
				t.Errorf("cleared cookies = %v, want both sess-ar4 and refr-ar4 cleared", cleared)
			}
			if !revoker.IsRevoked(context.Background(), "jti-handler-ar4") {
				t.Error("handler did not denylist the current jti")
			}
		})
	}
}
