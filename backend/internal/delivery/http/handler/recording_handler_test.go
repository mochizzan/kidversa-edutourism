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

// fakeRecordingRepo is an in-memory RecordingRepository for tests.
type fakeRecordingRepo struct {
	byID map[string]*entity.Recording
}

func newFakeRecordingRepo() *fakeRecordingRepo {
	return &fakeRecordingRepo{byID: map[string]*entity.Recording{}}
}

func (f *fakeRecordingRepo) Create(_ context.Context, r *entity.Recording) error {
	f.byID[r.ID] = r
	return nil
}
func (f *fakeRecordingRepo) GetByID(_ context.Context, id string) (*entity.Recording, error) {
	if r, ok := f.byID[id]; ok {
		return r, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeRecordingRepo) List(_ context.Context, _ repository.RecordingFilter, _, _ int) (*repository.Paginated[entity.Recording], error) {
	out := make([]entity.Recording, 0, len(f.byID))
	for _, r := range f.byID {
		out = append(out, *r)
	}
	return &repository.Paginated[entity.Recording]{Items: out, Total: len(out)}, nil
}
func (f *fakeRecordingRepo) Update(_ context.Context, r *entity.Recording) error {
	f.byID[r.ID] = r
	return nil
}
func (f *fakeRecordingRepo) Delete(_ context.Context, id string) error {
	delete(f.byID, id)
	return nil
}

func TestRecordingReviewUpdatesStatus(t *testing.T) {
	repo := newFakeRecordingRepo()
	h := NewRecordingHandler(repo)
	r := &entity.Recording{BaseModel: entity.BaseModel{ID: uuid.NewString()}, ParticipantID: "p1", ReviewStatus: entity.RecordingPending}
	_ = repo.Create(context.Background(), r)

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"review_status":"REVIEWED","reviewed_by":"u1"}`
	req := httptest.NewRequest(http.MethodPost, "/api/recordings/"+r.ID+"/review", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/recordings/:id/review")
	c.SetPathValues(echo.PathValues{{Name: "id", Value: r.ID}})

	if err := h.Review(c); err != nil {
		t.Fatalf("Review err: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var env struct {
		Data entity.Recording `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if env.Data.ReviewStatus != entity.RecordingReviewed {
		t.Fatalf("expected REVIEWED, got %s", env.Data.ReviewStatus)
	}
}
