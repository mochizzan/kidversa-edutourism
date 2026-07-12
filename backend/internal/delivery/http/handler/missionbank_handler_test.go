package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// fakeMissionBankRepo is an in-memory MissionBankRepository for tests.
type fakeMissionBankRepo struct {
	byID map[string]*entity.MissionBank
}

func newFakeMissionBankRepo() *fakeMissionBankRepo {
	return &fakeMissionBankRepo{byID: map[string]*entity.MissionBank{}}
}

func (f *fakeMissionBankRepo) Create(_ context.Context, m *entity.MissionBank) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	f.byID[m.ID] = m
	return nil
}
func (f *fakeMissionBankRepo) GetByID(_ context.Context, id string) (*entity.MissionBank, error) {
	if m, ok := f.byID[id]; ok {
		return m, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeMissionBankRepo) List(_ context.Context, _ repository.MissionBankFilter, _, _ int) (*repository.Paginated[entity.MissionBank], error) {
	out := make([]entity.MissionBank, 0, len(f.byID))
	for _, m := range f.byID {
		out = append(out, *m)
	}
	return &repository.Paginated[entity.MissionBank]{Items: out, Total: len(out)}, nil
}
func (f *fakeMissionBankRepo) Update(_ context.Context, m *entity.MissionBank) error {
	f.byID[m.ID] = m
	return nil
}
func (f *fakeMissionBankRepo) Delete(_ context.Context, id string) error {
	delete(f.byID, id)
	return nil
}
func (f *fakeMissionBankRepo) UpdateFields(_ context.Context, id string, _ map[string]interface{}) error {
	if _, ok := f.byID[id]; !ok {
		return repoErrNotFound
	}
	return nil
}

func TestMissionBankCreatePersists(t *testing.T) {
	repo := newFakeMissionBankRepo()
	h := NewMissionBankHandler(repo)

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"tenant_id":"t1","category":"HOME","title_child":"Baca","title_parent":"Membaca","is_active":true}`
	req := httptest.NewRequest(http.MethodPost, "/api/mission-banks", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/mission-banks")

	if err := h.Create(c); err != nil {
		t.Fatalf("Create err: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}
	var env struct {
		Data entity.MissionBank `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if env.Data.ID == "" || env.Data.Category != entity.MissionHome {
		t.Fatalf("unexpected mission: %+v", env.Data)
	}
}
