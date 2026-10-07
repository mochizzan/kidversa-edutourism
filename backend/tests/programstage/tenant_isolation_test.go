package programstage_test

import (
	"context"
	"encoding/json"
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
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

const (
	tenantA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
	tenantB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
)

func tenantOf(p *entity.Program) string {
	if p.TenantID == nil {
		return ""
	}
	return *p.TenantID
}

// assertAppError checks a handler-returned error carries the expected HTTP
// status and stable code (the middleware renders these into the envelope).
func assertAppError(t *testing.T, err error, status int, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected %d %q, got nil error", status, code)
	}
	gotStatus, gotCode, ok := apperrors.AsAppError(err)
	if !ok {
		t.Fatalf("expected AppError %d %q, got %v", status, code, err)
	}
	if gotStatus != status || gotCode != code {
		t.Fatalf("got %d %q, want %d %q", gotStatus, gotCode, status, code)
	}
}

// tenantProgramRepo serves program/stage reads for the Tahap 1 tenant tests:
// every tenant owns one program + one stage. Writes are no-ops recording
// their input; ListPaginatedStages answers dedup lookups from stored stages.
type tenantProgramRepo struct {
	fakeProgramRepo
	programs map[string]*entity.Program
	stages   map[string]*entity.ProgramStage
	created  *entity.Program
}

func (f *tenantProgramRepo) GetProgramByID(_ context.Context, id string) (*entity.Program, error) {
	p := f.programs[id]
	if p == nil {
		return nil, apperrors.NotFound("not_found", errors.New("program not found"))
	}
	cp := *p
	return &cp, nil
}

func (f *tenantProgramRepo) GetStageByID(_ context.Context, id string) (*entity.ProgramStage, error) {
	s := f.stages[id]
	if s == nil {
		return nil, apperrors.NotFound("not_found", errors.New("stage not found"))
	}
	cp := *s
	return &cp, nil
}

func (f *tenantProgramRepo) ListPrograms(_ context.Context, flt repository.ProgramFilter, _, _ int) (*repository.Paginated[entity.Program], error) {
	out := &repository.Paginated[entity.Program]{}
	for _, p := range f.programs {
		if flt.TenantID != "" && tenantOf(p) != flt.TenantID {
			continue
		}
		out.Items = append(out.Items, *p)
	}
	out.Total = len(out.Items)
	return out, nil
}

func (f *tenantProgramRepo) ListStages(_ context.Context, programID string) ([]entity.ProgramStage, error) {
	var out []entity.ProgramStage
	for _, s := range f.stages {
		if s.ProgramID == programID {
			out = append(out, *s)
		}
	}
	return out, nil
}

func (f *tenantProgramRepo) ListPaginatedStages(_ context.Context, flt repository.StageFilter, _, _ int) (*repository.Paginated[entity.ProgramStage], error) {
	out := &repository.Paginated[entity.ProgramStage]{}
	for _, s := range f.stages {
		if flt.ProgramID != "" && s.ProgramID != flt.ProgramID {
			continue
		}
		if flt.TenantID != "" {
			p := f.programs[s.ProgramID]
			if p == nil || tenantOf(p) != flt.TenantID {
				continue
			}
		}
		out.Items = append(out.Items, *s)
	}
	out.Total = len(out.Items)
	return out, nil
}

func (f *tenantProgramRepo) CreateProgram(_ context.Context, p *entity.Program) error {
	cp := *p
	f.created = &cp
	return nil
}

func (f *tenantProgramRepo) CreateStage(_ context.Context, s *entity.ProgramStage) error {
	cp := *s
	cp.ID = stageID
	f.stages[stageID] = &cp
	return nil
}

func twoTenantRepo() *tenantProgramRepo {
	progA := &entity.Program{BaseModel: entity.BaseModel{ID: programID}, TenantID: new(tenantA), Name: "Program A"}
	otherProg := "7ba7b810-9dad-11d1-80b4-00c04fd430c9"
	progB := &entity.Program{BaseModel: entity.BaseModel{ID: otherProg}, TenantID: new(tenantB), Name: "Program B"}
	return &tenantProgramRepo{
		programs: map[string]*entity.Program{programID: progA, otherProg: progB},
		stages: map[string]*entity.ProgramStage{
			stageID: {BaseModel: entity.BaseModel{ID: stageID}, ProgramID: programID, Name: "Topik A", ContentType: entity.ContentTypeVideo},
		},
	}
}

func newTenantCtx(e *echo.Echo, method, target, body, tenant string) (*echo.Context, *httptest.ResponseRecorder) {
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, target, nil)
	} else {
		req = httptest.NewRequest(method, target, strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	if tenant != "" {
		c.Set(appmiddleware.CtxTenantID, tenant)
	}
	return c, rec
}

// TestProgramGet_CrossTenant_Forbidden: GET another tenant's program → 403.
func TestProgramGet_CrossTenant_Forbidden(t *testing.T) {
	repo := twoTenantRepo()
	h := handler.NewProgramHandler(repo, nil)
	e := echo.New()
	c, rec := newTenantCtx(e, http.MethodGet, "/api/programs/"+programID, "", tenantB)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: programID}})
	if err := h.Get(c); err != nil {
		t.Fatalf("Get returned error: %v", err)
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403; body: %s", rec.Code, rec.Body.String())
	}
}

// TestProgramGet_OwnTenant_OK: GET own program → 200.
func TestProgramGet_OwnTenant_OK(t *testing.T) {
	repo := twoTenantRepo()
	h := handler.NewProgramHandler(repo, nil)
	e := echo.New()
	c, rec := newTenantCtx(e, http.MethodGet, "/api/programs/"+programID, "", tenantA)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: programID}})
	if err := h.Get(c); err != nil {
		t.Fatalf("Get returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
}

// TestCreateStage_FictitiousParent_NotFound: POST to a missing program →
// 404 via the repository, not a 500 FK violation.
func TestCreateStage_FictitiousParent_NotFound(t *testing.T) {
	repo := twoTenantRepo()
	h := handler.NewProgramHandler(repo, nil)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	fake := "8ba7b810-9dad-11d1-80b4-00c04fd430c0"
	c, rec := newTenantCtx(e, http.MethodPost, "/api/programs/"+fake+"/stages",
		`{"name":"Topik Baru","content_type":"VIDEO"}`, tenantA)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: fake}})
	err := h.CreateStage(c)
	assertAppError(t, err, http.StatusNotFound, "not_found")
	_ = rec
}

// TestCreateStage_CrossTenant_Forbidden: POST under another tenant's
// program → 403.
func TestCreateStage_CrossTenant_Forbidden(t *testing.T) {
	repo := twoTenantRepo()
	h := handler.NewProgramHandler(repo, nil)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	c, rec := newTenantCtx(e, http.MethodPost, "/api/programs/"+programID+"/stages",
		`{"name":"Topik Baru","content_type":"VIDEO"}`, tenantB)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: programID}})
	err := h.CreateStage(c)
	assertAppError(t, err, http.StatusForbidden, "forbidden")
	_ = rec
}

// TestCreateStage_DuplicateName_Conflict: same name in the same program →
// 409 conflict (app-level, no schema change).
func TestCreateStage_DuplicateName_Conflict(t *testing.T) {
	repo := twoTenantRepo()
	h := handler.NewProgramHandler(repo, nil)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	c, rec := newTenantCtx(e, http.MethodPost, "/api/programs/"+programID+"/stages",
		`{"name":"topik a","content_type":"VIDEO"}`, tenantA)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: programID}})
	if err := h.CreateStage(c); err != nil {
		t.Fatalf("CreateStage returned error: %v", err)
	}
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}
	var env struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("response not JSON: %v", err)
	}
	if env.Error.Code != "conflict" {
		t.Errorf("code = %q, want conflict", env.Error.Code)
	}
}

// TestCreateProgram_DuplicateName_SameTenantConflictOtherTenantAllowed.
func TestCreateProgram_DuplicateName_TenantScoped(t *testing.T) {
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()

	// Same tenant, same name (case-insensitive) → 409.
	repo := twoTenantRepo()
	h := handler.NewProgramHandler(repo, nil)
	c, rec := newTenantCtx(e, http.MethodPost, "/api/programs", `{"name":"program a"}`, tenantA)
	if err := h.Create(c); err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if rec.Code != http.StatusConflict {
		t.Fatalf("same-tenant status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}

	// Different tenant, same name → 201 (tenant-scoped dedup).
	repo2 := twoTenantRepo()
	h2 := handler.NewProgramHandler(repo2, nil)
	c2, rec2 := newTenantCtx(e, http.MethodPost, "/api/programs", `{"name":"Program A"}`, tenantB)
	if err := h2.Create(c2); err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if rec2.Code != http.StatusCreated {
		t.Fatalf("other-tenant status = %d, want 201; body: %s", rec2.Code, rec2.Body.String())
	}
}
