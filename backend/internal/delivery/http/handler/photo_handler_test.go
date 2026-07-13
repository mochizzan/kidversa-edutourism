package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// fakePhotoRepo is an in-memory PhotoRepository for tests.
type fakePhotoRepo struct {
	byID map[string]*entity.SmartPhoto
}

func newFakePhotoRepo() *fakePhotoRepo { return &fakePhotoRepo{byID: map[string]*entity.SmartPhoto{}} }

func (f *fakePhotoRepo) Create(_ context.Context, p *entity.SmartPhoto) error {
	f.byID[p.ID] = p
	return nil
}
func (f *fakePhotoRepo) GetByID(_ context.Context, id, _ string) (*entity.SmartPhoto, error) {
	if p, ok := f.byID[id]; ok {
		return p, nil
	}
	return nil, repoErrNotFound
}
func (f *fakePhotoRepo) List(_ context.Context, _ repository.PhotoFilter, _, _ int) (*repository.Paginated[entity.SmartPhoto], error) {
	out := make([]entity.SmartPhoto, 0, len(f.byID))
	for _, p := range f.byID {
		out = append(out, *p)
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: out, Total: len(out)}, nil
}
func (f *fakePhotoRepo) Update(_ context.Context, p *entity.SmartPhoto) error {
	f.byID[p.ID] = p
	return nil
}
func (f *fakePhotoRepo) Delete(_ context.Context, id string) error {
	delete(f.byID, id)
	return nil
}
func (f *fakePhotoRepo) UpdateFields(_ context.Context, id string, _ map[string]interface{}) error {
	if _, ok := f.byID[id]; !ok {
		return repoErrNotFound
	}
	return nil
}
func (f *fakePhotoRepo) SetReportPhoto(_ context.Context, _, _, _ string) error { return nil }

func TestPhotoListReturnsCreated(t *testing.T) {
	repo := newFakePhotoRepo()
	h := NewPhotoHandler(repo)
	p := &entity.SmartPhoto{BaseModel: entity.BaseModel{ID: uuid.NewString()}, ParticipantID: "p1", OriginalFileURL: "photos/x.jpg"}
	_ = repo.Create(context.Background(), p)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/photos?participant_id=p1", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/photos")

	if err := h.List(c); err != nil {
		t.Fatalf("List err: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var env struct {
		Data struct {
			Items []entity.SmartPhoto `json:"items"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if len(env.Data.Items) != 1 {
		t.Fatalf("expected 1 photo, got %d", len(env.Data.Items))
	}
}
