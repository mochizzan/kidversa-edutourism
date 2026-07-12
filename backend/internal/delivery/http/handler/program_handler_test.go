package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

type fakeProgramRepo struct {
	programs map[string]*entity.Program
}

func newFakeProgramRepo() *fakeProgramRepo { return &fakeProgramRepo{programs: map[string]*entity.Program{}} }

func (f *fakeProgramRepo) CreateProgram(_ context.Context, p *entity.Program) error {
	f.programs[p.ID] = p
	return nil
}
func (f *fakeProgramRepo) GetProgramByID(_ context.Context, id string) (*entity.Program, error) {
	if p, ok := f.programs[id]; ok {
		return p, nil
	}
	return nil, errNotFound
}
func (f *fakeProgramRepo) ListPrograms(_ context.Context, _ repository.ProgramFilter, _, _ int) (*repository.Paginated[entity.Program], error) {
	return &repository.Paginated[entity.Program]{}, nil
}
func (f *fakeProgramRepo) UpdateProgram(_ context.Context, p *entity.Program) error { f.programs[p.ID] = p; return nil }
func (f *fakeProgramRepo) DeleteProgram(_ context.Context, id string) error          { delete(f.programs, id); return nil }
func (f *fakeProgramRepo) ToggleActiveProgram(_ context.Context, id string) (*entity.Program, error) {
	p, ok := f.programs[id]
	if !ok {
		return nil, errNotFound
	}
	p.IsActive = !p.IsActive
	return p, nil
}
func (f *fakeProgramRepo) CreateStage(_ context.Context, _ *entity.ProgramStage) error      { return nil }
func (f *fakeProgramRepo) GetStageByID(_ context.Context, _ string) (*entity.ProgramStage, error) {
	return nil, errNotFound
}
func (f *fakeProgramRepo) ListStages(_ context.Context, _ string) ([]entity.ProgramStage, error) {
	return nil, nil
}
func (f *fakeProgramRepo) UpdateStage(_ context.Context, _ *entity.ProgramStage) error { return nil }
func (f *fakeProgramRepo) DeleteStage(_ context.Context, _ string) error               { return nil }
func (f *fakeProgramRepo) ReorderStages(_ context.Context, _ string, _ []string) error { return nil }
func (f *fakeProgramRepo) CreateContent(_ context.Context, _ *entity.StageContent) error { return nil }
func (f *fakeProgramRepo) GetContentByID(_ context.Context, _ string) (*entity.StageContent, error) {
	return nil, errNotFound
}
func (f *fakeProgramRepo) ListContents(_ context.Context, _ string) ([]entity.StageContent, error) {
	return nil, nil
}
func (f *fakeProgramRepo) UpdateContent(_ context.Context, _ *entity.StageContent) error { return nil }
func (f *fakeProgramRepo) DeleteContent(_ context.Context, _ string) error               { return nil }
func (f *fakeProgramRepo) ReorderContents(_ context.Context, _ string, _ []string) error { return nil }

var errNotFound = &repoErr{msg: "not found"}
type repoErr struct{ msg string }
func (e *repoErr) Error() string { return e.msg }

func TestProgramCreateAndToggle(t *testing.T) {
	repo := newFakeProgramRepo()
	h := NewProgramHandler(repo)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()

	t.Run("create 201", func(t *testing.T) {
		body := `{"name":"Edu Tour 1","description":"desc","is_active":true}`
		req := httptest.NewRequest(http.MethodPost, "/api/programs", strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		if err := h.Create(c); err != nil {
			t.Fatalf("Create error: %v", err)
		}
		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d (%s)", rec.Code, rec.Body.String())
		}
		var env struct {
			Data dto.ProgramRequest `json:"data"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &env)
	})

	t.Run("toggle-active", func(t *testing.T) {
		repo.programs["11111111-1111-1111-1111-111111111111"] = &entity.Program{BaseModel: entity.BaseModel{ID: "11111111-1111-1111-1111-111111111111"}, Name: "p", IsActive: true}
		req := httptest.NewRequest(http.MethodPost, "/api/programs/11111111-1111-1111-1111-111111111111/toggle-active", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetPath("/api/programs/:id/toggle-active")
		c.SetPathValues(echo.PathValues{{Name: "id", Value: "11111111-1111-1111-1111-111111111111"}})
		if err := h.ToggleActive(c); err != nil {
			t.Fatalf("ToggleActive error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d (%s)", rec.Code, rec.Body.String())
		}
		var env struct {
			Data dto.ToggleActiveResponse `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
			t.Fatalf("bad json: %v", err)
		}
		if env.Data.IsActive != false {
			t.Fatalf("expected IsActive false after toggle, got %v", env.Data.IsActive)
		}
	})
}
