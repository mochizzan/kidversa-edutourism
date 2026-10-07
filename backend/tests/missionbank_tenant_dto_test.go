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
)

// tenantScopeID is the resolved scope tenant (JWT tenant for non-SA);
// scopeForeignID is a stale/forged tenant_id a legacy client may still send.
const (
	tenantScopeID   = "tenant-scope"
	scopeForeignID  = "tenant-foreign"
	missionBankUUID = "22222222-2222-4222-8222-222222222222"
)

// tenantDtoMissionBankFake is an in-memory MissionBankRepository fake — no DB.
type tenantDtoMissionBankFake struct {
	repository.MissionBankRepository
	created *entity.MissionBank
	stored  *entity.MissionBank
	updated *entity.MissionBank
}

func (f *tenantDtoMissionBankFake) Create(_ context.Context, m *entity.MissionBank) error {
	cp := *m
	f.created = &cp
	return nil
}

func (f *tenantDtoMissionBankFake) GetByID(_ context.Context, _, _ string) (*entity.MissionBank, error) {
	cp := *f.stored
	return &cp, nil
}

func (f *tenantDtoMissionBankFake) Update(_ context.Context, m *entity.MissionBank) error {
	cp := *m
	f.updated = &cp
	return nil
}

func runMissionBankCreate(t *testing.T, fake *tenantDtoMissionBankFake, body string) *httptest.ResponseRecorder {
	t.Helper()
	h := handler.NewMissionBankHandler(fake)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	req := httptest.NewRequest(http.MethodPost, "/api/mission-banks", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, tenantScopeID)
	if err := h.Create(c); err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	return rec
}

func runMissionBankUpdate(t *testing.T, fake *tenantDtoMissionBankFake, body string) *httptest.ResponseRecorder {
	t.Helper()
	h := handler.NewMissionBankHandler(fake)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	req := httptest.NewRequest(http.MethodPut, "/api/mission-banks/"+missionBankUUID, strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, tenantScopeID)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: missionBankUUID}})
	if err := h.Update(c); err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	return rec
}

func storedMissionBank() *entity.MissionBank {
	m := &entity.MissionBank{
		TenantID:  tenantScopeID,
		ProgramID: "program-1",
		Title:     "Old title",
		IsActive:  true,
	}
	m.ID = missionBankUUID
	return m
}

// (i) POST create without tenant_id → 201, record carries the scope tenant.
func TestMissionBank_Create_WithoutTenantID_UsesScope(t *testing.T) {
	fake := &tenantDtoMissionBankFake{}
	rec := runMissionBankCreate(t, fake, `{"program_id":"program-1","title":"Misi Baru","is_active":true}`)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", rec.Code, rec.Body.String())
	}
	if fake.created == nil {
		t.Fatal("Create: nothing persisted")
	}
	if fake.created.TenantID != tenantScopeID {
		t.Errorf("TenantID = %q, want scope %q", fake.created.TenantID, tenantScopeID)
	}
	if fake.created.Title != "Misi Baru" {
		t.Errorf("Title = %q, want %q", fake.created.Title, "Misi Baru")
	}
}

// (ii) PUT update without tenant_id → 200.
func TestMissionBank_Update_WithoutTenantID_OK(t *testing.T) {
	fake := &tenantDtoMissionBankFake{stored: storedMissionBank()}
	rec := runMissionBankUpdate(t, fake, `{"program_id":"program-1","title":"Misi Revisi","is_active":false}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	if fake.updated == nil {
		t.Fatal("Update: nothing persisted")
	}
	if fake.updated.Title != "Misi Revisi" {
		t.Errorf("Title = %q, want %q", fake.updated.Title, "Misi Revisi")
	}
	if fake.updated.TenantID != tenantScopeID {
		t.Errorf("TenantID = %q, want scope %q", fake.updated.TenantID, tenantScopeID)
	}
}

// (iii) POST with a stale/foreign tenant_id in the body → still accepted, scope wins (anti-forgery F5).
func TestMissionBank_Create_StaleTenantID_Ignored(t *testing.T) {
	fake := &tenantDtoMissionBankFake{}
	rec := runMissionBankCreate(t, fake,
		`{"tenant_id":"`+scopeForeignID+`","program_id":"program-1","title":"Misi Lama","is_active":true}`)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (backward compatible); body: %s", rec.Code, rec.Body.String())
	}
	if fake.created == nil {
		t.Fatal("Create: nothing persisted")
	}
	if fake.created.TenantID != tenantScopeID {
		t.Errorf("TenantID = %q, want scope %q (body tenant_id must be ignored)", fake.created.TenantID, tenantScopeID)
	}
}

// (iv) POST without program_id/title → still 400 validation_error.
func TestMissionBank_Create_MissingRequired_Still400(t *testing.T) {
	for _, body := range []string{
		`{}`,
		`{"title":"Tanpa Program"}`,
		`{"program_id":"program-1"}`,
	} {
		fake := &tenantDtoMissionBankFake{}
		rec := runMissionBankCreate(t, fake, body)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("body %s: status = %d, want 400", body, rec.Code)
		}
		if !strings.Contains(rec.Body.String(), `"code":"validation_error"`) {
			t.Errorf("body %s: expected validation_error envelope, got: %s", body, rec.Body.String())
		}
		if fake.created != nil {
			t.Errorf("body %s: invalid payload persisted", body)
		}
	}
}
