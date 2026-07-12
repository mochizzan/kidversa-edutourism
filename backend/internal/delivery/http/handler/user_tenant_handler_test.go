package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// --- fakes ---

type fakeUserRepoPhase3 struct {
	byID    map[string]*entity.User
	byEmail map[string]*entity.User
	seq     int
}

func newFakeUserRepoP3() *fakeUserRepoPhase3 {
	return &fakeUserRepoPhase3{byID: map[string]*entity.User{}, byEmail: map[string]*entity.User{}}
}

func (f *fakeUserRepoPhase3) Create(_ context.Context, u *entity.User) error {
	f.byID[u.ID] = u
	f.byEmail[strings.ToLower(u.Email)] = u
	return nil
}
func (f *fakeUserRepoPhase3) GetByID(_ context.Context, id string) (*entity.User, error) {
	if u, ok := f.byID[id]; ok {
		return u, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeUserRepoPhase3) GetByEmail(_ context.Context, email string) (*entity.User, error) {
	if u, ok := f.byEmail[strings.ToLower(email)]; ok {
		return u, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeUserRepoPhase3) List(_ context.Context, f2 repository.UserFilter, _, _ int) (*repository.Paginated[entity.User], error) {
	items := make([]entity.User, 0, len(f.byID))
	for _, u := range f.byID {
		if f2.TenantID != "" && (u.TenantID == nil || *u.TenantID != f2.TenantID) {
			continue
		}
		if f2.Role != "" && string(u.Role) != f2.Role {
			continue
		}
		items = append(items, *u)
	}
	return &repository.Paginated[entity.User]{Items: items, Total: len(items)}, nil
}
func (f *fakeUserRepoPhase3) Update(_ context.Context, u *entity.User) error {
	f.byID[u.ID] = u
	return nil
}
func (f *fakeUserRepoPhase3) Delete(_ context.Context, id string) error {
	delete(f.byID, id)
	return nil
}
func (f *fakeUserRepoPhase3) Approve(_ context.Context, id, approverID string) (*entity.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, repoErrNotFound
	}
	now := time.Now().Format(time.RFC3339)
	u.IsActive = true
	u.ApprovalStatus = entity.ApprovalApproved
	u.ApprovedAt = &now
	u.ApprovedBy = &approverID
	return u, nil
}
func (f *fakeUserRepoPhase3) Reject(_ context.Context, id, approverID, reason string) (*entity.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, repoErrNotFound
	}
	now := time.Now().Format(time.RFC3339)
	u.IsActive = false
	u.ApprovalStatus = entity.ApprovalRejected
	u.RejectedAt = &now
	u.RejectedBy = &approverID
	u.RejectionReason = reason
	return u, nil
}
func (f *fakeUserRepoPhase3) Deactivate(_ context.Context, id string) (*entity.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, repoErrNotFound
	}
	u.IsActive = false
	return u, nil
}

type fakeTenantRepoPhase3 struct {
	byID   map[string]*entity.Tenant
	bySlug map[string]*entity.Tenant
}

func newFakeTenantRepoP3() *fakeTenantRepoPhase3 {
	return &fakeTenantRepoPhase3{byID: map[string]*entity.Tenant{}, bySlug: map[string]*entity.Tenant{}}
}
func (f *fakeTenantRepoPhase3) Create(_ context.Context, t *entity.Tenant) error {
	f.byID[t.ID] = t
	f.bySlug[t.Slug] = t
	return nil
}
func (f *fakeTenantRepoPhase3) GetByID(_ context.Context, id string) (*entity.Tenant, error) {
	if t, ok := f.byID[id]; ok {
		return t, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeTenantRepoPhase3) GetBySlug(_ context.Context, slug string) (*entity.Tenant, error) {
	if t, ok := f.bySlug[strings.ToLower(slug)]; ok {
		return t, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeTenantRepoPhase3) List(_ context.Context, _ repository.TenantFilter, _, _ int) (*repository.Paginated[entity.Tenant], error) {
	items := make([]entity.Tenant, 0, len(f.byID))
	for _, t := range f.byID {
		items = append(items, *t)
	}
	return &repository.Paginated[entity.Tenant]{Items: items, Total: len(items)}, nil
}
func (f *fakeTenantRepoPhase3) Update(_ context.Context, t *entity.Tenant) error {
	f.byID[t.ID] = t
	return nil
}
func (f *fakeTenantRepoPhase3) Delete(_ context.Context, id string) error {
	delete(f.byID, id)
	return nil
}

func newTestUserHandler() (*UserHandler, *fakeUserRepoPhase3) {
	cfg := &config.Config{JWTSecret: "test-secret-at-least-32-bytes-long!!!"}
	jm := auth.NewJWTManager(cfg)
	repo := newFakeUserRepoP3()
	uc := auth.NewUserUsecase(repo)
	h := NewUserHandler(uc, jm)
	return h, repo
}

func newTestTenantHandler() (*TenantHandler, *fakeTenantRepoPhase3) {
	cfg := &config.Config{JWTSecret: "test-secret-at-least-32-bytes-long!!!"}
	jm := auth.NewJWTManager(cfg)
	repo := newFakeTenantRepoP3()
	uc := auth.NewTenantUsecase(repo)
	h := NewTenantHandler(uc, jm)
	return h, repo
}

// setCtx injects role + tenant claims as middleware would.
func setCtx(c *echo.Context, role, tenantID string) {
	(*c).Set(appmiddleware.CtxRole, role)
	(*c).Set(appmiddleware.CtxTenantID, tenantID)
	(*c).Set(appmiddleware.CtxUserID, "actor-1")
}

func TestUserHandlerCreateSuccess(t *testing.T) {
	h, repo := newTestUserHandler()
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()

	tenantID := "t1"
	body := `{"email":"new@example.com","password":"secret123","name":"New User","role":"FASILITATOR","tenant_id":"t1"}`
	req := httptest.NewRequest(http.MethodPost, "/api/users", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/users")
	setCtx(c, string(entity.RoleSuperAdmin), tenantID)

	if err := h.Create(c); err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	if _, ok := repo.byEmail["new@example.com"]; !ok {
		t.Fatalf("user not created in repo")
	}
}

func TestUserHandlerApprove(t *testing.T) {
	h, repo := newTestUserHandler()
	id := uuid.NewString()
	repo.byID[id] = &entity.User{BaseModel: entity.BaseModel{ID: id}, Email: "p@example.com", Role: entity.RoleFasilitator, IsActive: false, ApprovalStatus: entity.ApprovalPending}

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/users/"+id+"/approve", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/users/:id/approve")
	c.SetPathValues(echo.PathValues{{Name: "id", Value: id}})
	setCtx(c, string(entity.RoleSuperAdmin), "t1")

	if err := h.Approve(c); err != nil {
		t.Fatalf("Approve returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			IsActive       bool   `json:"is_active"`
			ApprovalStatus string `json:"approval_status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if !env.Data.IsActive || env.Data.ApprovalStatus != "approved" {
		t.Fatalf("expected approved+active, got %+v", env.Data)
	}
}

func TestUserHandlerInvalidID(t *testing.T) {
	h, _ := newTestUserHandler()
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/users/not-a-uuid", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/users/:id")
	c.SetPathValues(echo.PathValues{{Name: "id", Value: "not-a-uuid"}})
	setCtx(c, string(entity.RoleSuperAdmin), "t1")

	if err := h.Get(c); err != nil {
		t.Fatalf("Get returned error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid id, got %d", rec.Code)
	}
}

func TestTenantHandlerCreateAndGet(t *testing.T) {
	h, repo := newTestTenantHandler()
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()

	body := `{"name":"Acme","slug":"acme","settings_json":"{\"theme\":\"dark\"}"}`
	req := httptest.NewRequest(http.MethodPost, "/api/tenants", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/tenants")
	setCtx(c, string(entity.RoleSuperAdmin), "t1")

	if err := h.Create(c); err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			ID   string `json:"id"`
			Slug string `json:"slug"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if env.Data.Slug != "acme" {
		t.Fatalf("expected slug acme, got %q", env.Data.Slug)
	}
	if _, ok := repo.bySlug["acme"]; !ok {
		t.Fatalf("tenant not created in repo")
	}

	// Get it back.
	req2 := httptest.NewRequest(http.MethodGet, "/api/tenants/"+env.Data.ID, nil)
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)
	c2.SetPath("/api/tenants/:id")
	c2.SetPathValues(echo.PathValues{{Name: "id", Value: env.Data.ID}})
	setCtx(c2, string(entity.RoleSuperAdmin), "t1")
	if err := h.Get(c2); err != nil {
		t.Fatalf("Get returned error: %v", err)
	}
	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200 on get, got %d (body=%s)", rec2.Code, rec2.Body.String())
	}
}
