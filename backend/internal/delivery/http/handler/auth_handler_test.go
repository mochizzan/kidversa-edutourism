package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// fakeUserRepo is an in-memory UserRepository for tests.
type fakeUserRepo struct {
	byEmail map[string]*entity.User
	byID    map[string]*entity.User
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{byEmail: map[string]*entity.User{}, byID: map[string]*entity.User{}}
}

func (f *fakeUserRepo) Create(_ context.Context, u *entity.User) error {
	f.byID[u.ID] = u
	f.byEmail[strings.ToLower(u.Email)] = u
	return nil
}
func (f *fakeUserRepo) GetByID(_ context.Context, id string) (*entity.User, error) {
	if u, ok := f.byID[id]; ok {
		return u, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeUserRepo) GetByEmail(_ context.Context, email string) (*entity.User, error) {
	if u, ok := f.byEmail[strings.ToLower(email)]; ok {
		return u, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeUserRepo) List(_ context.Context, _ repository.UserFilter, _, _ int) (*repository.Paginated[entity.User], error) {
	return &repository.Paginated[entity.User]{}, nil
}
func (f *fakeUserRepo) Update(_ context.Context, u *entity.User) error {
	f.byID[u.ID] = u
	return nil
}
func (f *fakeUserRepo) Delete(_ context.Context, id string) error {
	delete(f.byID, id)
	return nil
}
func (f *fakeUserRepo) Approve(_ context.Context, id, approverID string) (*entity.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, repoErrNotFound
	}
	u.IsActive = true
	u.ApprovalStatus = entity.ApprovalApproved
	u.ApprovedBy = &approverID
	return u, nil
}
func (f *fakeUserRepo) Reject(_ context.Context, id, approverID, reason string) (*entity.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, repoErrNotFound
	}
	u.IsActive = false
	u.ApprovalStatus = entity.ApprovalRejected
	u.RejectionReason = reason
	return u, nil
}
func (f *fakeUserRepo) Deactivate(_ context.Context, id string) (*entity.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, repoErrNotFound
	}
	u.IsActive = false
	return u, nil
}

var repoErrNotFound = errorString("not found")

type errorString string

func (e errorString) Error() string { return string(e) }

func newTestAuthHandler() (*AuthHandler, *fakeUserRepo) {
	cfg := &config.Config{JWTSecret: "test-secret-at-least-32-bytes-long!!!", JWTAccessTTL: 15 * time.Minute, JWTRefreshTTL: 168 * time.Hour, BcryptCost: 4}
	jm := auth.NewJWTManager(cfg)
	revoker := auth.NewInMemoryRevoker()
	refresh := auth.NewInMemoryRefreshStore()
	repo := newFakeUserRepo()
	uc := auth.NewUsecase(repo, jm, revoker, refresh, nil, cfg.BcryptCost)
	h := NewAuthHandler(uc, jm, "kidversa_session", "kidversa_refresh", false, "Lax")
	return h, repo
}

func TestAuthLoginSuccess(t *testing.T) {
	h, repo := newTestAuthHandler()
	hash, _ := auth.BcryptHash("password123", 4)
	repo.Create(context.Background(), &entity.User{
		BaseModel: entity.BaseModel{ID: "u1"},
		Email:     "admin@example.com", Name: "Admin", Role: entity.RoleAdmin,
		TenantID: &[]string{"t1"}[0], IsActive: true, ApprovalStatus: entity.ApprovalApproved, PasswordHash: hash,
	})

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"email":"admin@example.com","password":"password123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/auth/login")

	if err := h.Login(c); err != nil {
		t.Fatalf("Login returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if env.Data.AccessToken == "" || env.Data.RefreshToken == "" {
		t.Fatalf("expected tokens in response")
	}
	// SSE cookie must be set
	found := false
	for _, ck := range rec.Result().Cookies() {
		if ck.Name == "kidversa_session" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected SSE session cookie to be set")
	}
}

func TestAuthLoginWrongPassword(t *testing.T) {
	h, repo := newTestAuthHandler()
	hash, _ := auth.BcryptHash("password123", 4)
	repo.Create(context.Background(), &entity.User{
		BaseModel: entity.BaseModel{ID: "u1"},
		Email:     "admin@example.com", Name: "Admin", Role: entity.RoleAdmin,
		TenantID: &[]string{"t1"}[0], IsActive: true, ApprovalStatus: entity.ApprovalApproved, PasswordHash: hash,
	})

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"email":"admin@example.com","password":"wrongpass"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/auth/login")

	if err := h.Login(c); err != nil {
		t.Fatalf("Login returned error: %v", err)
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

func TestJWTSignParseRoundtrip(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret-at-least-32-bytes-long!!!", JWTAccessTTL: 15 * time.Minute, JWTRefreshTTL: 168 * time.Hour, BcryptCost: 4}
	jm := auth.NewJWTManager(cfg)
	tid := "t1"
	access, _, err := jm.Generate("u1", &tid, string(entity.RoleAdmin))
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	claims, err := jm.Parse(access)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if claims.UserID != "u1" || claims.TenantID != "t1" || claims.Role != string(entity.RoleAdmin) {
		t.Fatalf("claims mismatch: %+v", claims)
	}
	// Forged token with different secret must fail.
	badCfg := &config.Config{JWTSecret: "different-secret-also-32-bytes-long!!", JWTAccessTTL: 0, JWTRefreshTTL: 0, BcryptCost: 4}
	badJM := auth.NewJWTManager(badCfg)
	if _, err := badJM.Parse(access); err == nil {
		t.Fatalf("expected parse failure with wrong secret")
	}
}
