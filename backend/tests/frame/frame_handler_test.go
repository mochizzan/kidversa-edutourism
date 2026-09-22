package frame_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// testFrameID is a well-formed UUID literal so bindUUID accepts the param
// without pulling in a uuid dependency.
const testFrameID = "11111111-1111-4111-8111-111111111111"

// fakeFrameRepo is an in-memory FrameRepository fake — no DB, per repo test convention.
type fakeFrameRepo struct {
	lastFields map[string]interface{}
	lastID     string
	stored     *entity.PhotoFrame
}

func (f *fakeFrameRepo) Create(_ context.Context, _ *entity.PhotoFrame) error { return nil }

func (f *fakeFrameRepo) GetByID(_ context.Context, _, _ string) (*entity.PhotoFrame, error) {
	if f.stored == nil {
		return nil, nil
	}
	clone := *f.stored
	return &clone, nil
}

func (f *fakeFrameRepo) List(_ context.Context, _ repository.FrameFilter, _, _ int) (*repository.Paginated[entity.PhotoFrame], error) {
	return &repository.Paginated[entity.PhotoFrame]{}, nil
}

func (f *fakeFrameRepo) Update(_ context.Context, _ *entity.PhotoFrame) error { return nil }

func (f *fakeFrameRepo) UpdateFields(_ context.Context, id string, fields map[string]interface{}) error {
	f.lastID = id
	f.lastFields = fields
	if v, ok := fields["is_active"].(bool); ok && f.stored != nil {
		f.stored.IsActive = v
	}
	return nil
}

func (f *fakeFrameRepo) Delete(_ context.Context, _ string) error { return nil }

// runFrameToggle invokes a FrameHandler toggle method against a fresh echo
// context carrying a valid :id param, returning the fake and the recorder.
func runFrameToggle(t *testing.T, seg string, call func(*handler.FrameHandler, *echo.Context) error) (*fakeFrameRepo, *httptest.ResponseRecorder) {
	t.Helper()

	stored := &entity.PhotoFrame{IsActive: true}
	stored.ID = testFrameID
	fake := &fakeFrameRepo{stored: stored}

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/frames/"+testFrameID+"/"+seg, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: testFrameID}})

	h := handler.NewFrameHandler(fake)
	if err := call(h, c); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	return fake, rec
}

func TestFrameHandler_Activate(t *testing.T) {
	fake, rec := runFrameToggle(t, "activate", func(h *handler.FrameHandler, c *echo.Context) error {
		return h.Activate(c)
	})

	if got, _ := fake.lastFields["is_active"].(bool); got != true {
		t.Errorf("expected is_active=true, got %v", fake.lastFields["is_active"])
	}
	if fake.lastID != testFrameID {
		t.Errorf("expected lastID=%q, got %q", testFrameID, fake.lastID)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"is_active":true`) {
		t.Errorf("response body missing is_active=true: %s", rec.Body.String())
	}
}

func TestFrameHandler_Deactivate(t *testing.T) {
	fake, rec := runFrameToggle(t, "deactivate", func(h *handler.FrameHandler, c *echo.Context) error {
		return h.Deactivate(c)
	})

	if got, _ := fake.lastFields["is_active"].(bool); got != false {
		t.Errorf("expected is_active=false, got %v", fake.lastFields["is_active"])
	}
	if fake.lastID != testFrameID {
		t.Errorf("expected lastID=%q, got %q", testFrameID, fake.lastID)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"is_active":false`) {
		t.Errorf("response body missing is_active=false: %s", rec.Body.String())
	}
}
