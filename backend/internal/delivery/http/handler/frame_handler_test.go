package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/google/uuid"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
)

// fakeFrameRepo is an in-memory FrameRepository for tests.
type fakeFrameRepo struct {
	byID map[string]*entity.PhotoFrame
}

func newFakeFrameRepo() *fakeFrameRepo { return &fakeFrameRepo{byID: map[string]*entity.PhotoFrame{}} }

func (f *fakeFrameRepo) Create(_ context.Context, fr *entity.PhotoFrame) error {
	if fr.ID == "" {
		fr.ID = uuid.NewString()
	}
	f.byID[fr.ID] = fr
	return nil
}
func (f *fakeFrameRepo) GetByID(_ context.Context, id string) (*entity.PhotoFrame, error) {
	if fr, ok := f.byID[id]; ok {
		return fr, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeFrameRepo) List(_ context.Context, _ repository.FrameFilter, _, _ int) (*repository.Paginated[entity.PhotoFrame], error) {
	out := make([]entity.PhotoFrame, 0, len(f.byID))
	for _, fr := range f.byID {
		out = append(out, *fr)
	}
	return &repository.Paginated[entity.PhotoFrame]{Items: out, Total: len(out)}, nil
}
func (f *fakeFrameRepo) Update(_ context.Context, fr *entity.PhotoFrame) error {
	f.byID[fr.ID] = fr
	return nil
}
func (f *fakeFrameRepo) Delete(_ context.Context, id string) error { delete(f.byID, id); return nil }

func TestFrameCreatePersists(t *testing.T) {
	repo := newFakeFrameRepo()
	h := NewFrameHandler(repo)

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"tenant_id":"t1","name":"Bunga","file_url":"frames/bunga.png","is_active":true,"sort_order":1}`
	req := httptest.NewRequest(http.MethodPost, "/api/frames", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/frames")

	if err := h.Create(c); err != nil {
		t.Fatalf("Create err: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}
	var env struct {
		Data entity.PhotoFrame `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if env.Data.ID == "" || env.Data.Name != "Bunga" {
		t.Fatalf("unexpected frame: %+v", env.Data)
	}
}
