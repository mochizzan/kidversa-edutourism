package frame_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// errFrameNotFound simulates the repo miss used when the id or tenant scope
// does not resolve a row.
var errFrameNotFound = errors.New("not found")

// tenantScopeFrameRepo is an in-memory FrameRepository fake scoped by tenant:
// GetByID only resolves rows owned by the requesting tenant (mirrors the real
// repo's tenant check), and Update captures the persisted entity.
type tenantScopeFrameRepo struct {
	stored  *entity.PhotoFrame
	updated *entity.PhotoFrame
}

func (f *tenantScopeFrameRepo) Create(_ context.Context, _ *entity.PhotoFrame) error {
	return nil
}

func (f *tenantScopeFrameRepo) GetByID(_ context.Context, id, tenantID string) (*entity.PhotoFrame, error) {
	if f.stored == nil || f.stored.ID != id || f.stored.TenantID != tenantID {
		return nil, errFrameNotFound
	}
	clone := *f.stored
	return &clone, nil
}

func (f *tenantScopeFrameRepo) List(_ context.Context, _ repository.FrameFilter, _, _ int) (*repository.Paginated[entity.PhotoFrame], error) {
	return &repository.Paginated[entity.PhotoFrame]{}, nil
}

func (f *tenantScopeFrameRepo) Update(_ context.Context, fr *entity.PhotoFrame) error {
	clone := *fr
	f.updated = &clone
	f.stored = &clone
	return nil
}

func (f *tenantScopeFrameRepo) UpdateFields(_ context.Context, _ string, _ map[string]interface{}) error {
	return nil
}

func (f *tenantScopeFrameRepo) Delete(_ context.Context, _ string) error { return nil }

// runFrameUpdate invokes FrameHandler.Update with a JSON body under the given
// scope tenant, returning the fake and the recorder.
func runFrameUpdate(t *testing.T, body, scopeTenant string) (*tenantScopeFrameRepo, *httptest.ResponseRecorder) {
	t.Helper()

	stored := &entity.PhotoFrame{TenantID: scopeTenant, Name: "Old", FileURL: "/old.png"}
	stored.ID = testFrameID
	fake := &tenantScopeFrameRepo{stored: stored}

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	req := httptest.NewRequest(http.MethodPut, "/api/frames/"+testFrameID, strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, scopeTenant)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: testFrameID}})

	h := handler.NewFrameHandler(fake)
	if err := h.Update(c); err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	return fake, rec
}

// PUT without tenant_id must pass validation — tenant comes from scope (F5).
func TestFrameUpdate_WithoutTenantID(t *testing.T) {
	fake, rec := runFrameUpdate(t, `{"name":"New","file_url":"/new.png"}`, "tenant-scope")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if fake.updated == nil {
		t.Fatal("expected Update to persist the frame")
	}
	if fake.updated.TenantID != "tenant-scope" {
		t.Errorf("expected record tenant %q, got %q", "tenant-scope", fake.updated.TenantID)
	}
	if fake.updated.Name != "New" {
		t.Errorf("expected name %q, got %q", "New", fake.updated.Name)
	}
}

// A stale/foreign tenant_id in the body must be ignored (non-strict binder)
// with the scope tenant winning (anti-forgery, F5).
func TestFrameUpdate_StaleTenantIDIgnored(t *testing.T) {
	fake, rec := runFrameUpdate(t, `{"tenant_id":"tenant-foreign","name":"New","file_url":"/new.png"}`, "tenant-scope")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if fake.updated == nil {
		t.Fatal("expected Update to persist the frame")
	}
	if fake.updated.TenantID != "tenant-scope" {
		t.Errorf("scope tenant must win: expected %q, got %q", "tenant-scope", fake.updated.TenantID)
	}
}
