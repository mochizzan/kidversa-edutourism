package programstage_test

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

const (
	subStageID = "660e8400-e29b-41d4-a716-446655440001"
)

// fakeSubstageRepo serves Kegiatan reads for the Tahap 1 tenant tests.
type fakeSubstageRepo struct {
	repository.ProgramSubstageRepository
	subs map[string]*entity.ProgramSubstage
}

func (f *fakeSubstageRepo) GetSubstageByID(_ context.Context, id string) (*entity.ProgramSubstage, error) {
	s := f.subs[id]
	if s == nil {
		return nil, apperrors.NotFound("not_found", errors.New("substage not found"))
	}
	cp := *s
	return &cp, nil
}

func (f *fakeSubstageRepo) ListPaginatedSubstages(_ context.Context, flt repository.SubstageFilter, _, _ int) (*repository.Paginated[entity.ProgramSubstage], error) {
	out := &repository.Paginated[entity.ProgramSubstage]{}
	for _, s := range f.subs {
		if flt.ProgramStageID != "" && s.ProgramStageID != flt.ProgramStageID {
			continue
		}
		out.Items = append(out.Items, *s)
	}
	out.Total = len(out.Items)
	return out, nil
}

func (f *fakeSubstageRepo) CreateSubstage(_ context.Context, s *entity.ProgramSubstage) error {
	cp := *s
	f.subs[subStageID] = &cp
	return nil
}

// TestSubstageGet_CrossTenant_Forbidden: GET another tenant's Kegiatan → 403.
func TestSubstageGet_CrossTenant_Forbidden(t *testing.T) {
	progs := twoTenantRepo()
	subs := &fakeSubstageRepo{subs: map[string]*entity.ProgramSubstage{
		subStageID: {BaseModel: entity.BaseModel{ID: subStageID}, ProgramStageID: stageID, Name: "Kegiatan A"},
	}}
	h := handler.NewProgramSubstageHandler(subs, progs)
	e := echo.New()
	c, rec := newTenantCtx(e, http.MethodGet, "/api/program-substages/"+subStageID, "", tenantB)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: subStageID}})
	err := h.Get(c)
	assertAppError(t, err, http.StatusForbidden, "forbidden")
	_ = rec
}

// TestSubstageGet_OwnTenant_OK: GET own Kegiatan → 200.
func TestSubstageGet_OwnTenant_OK(t *testing.T) {
	progs := twoTenantRepo()
	subs := &fakeSubstageRepo{subs: map[string]*entity.ProgramSubstage{
		subStageID: {BaseModel: entity.BaseModel{ID: subStageID}, ProgramStageID: stageID, Name: "Kegiatan A"},
	}}
	h := handler.NewProgramSubstageHandler(subs, progs)
	e := echo.New()
	c, rec := newTenantCtx(e, http.MethodGet, "/api/program-substages/"+subStageID, "", tenantA)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: subStageID}})
	if err := h.Get(c); err != nil {
		t.Fatalf("Get returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
}

// TestSubstageCreate_FictitiousStage_NotFound: POST with a missing Topik → 404, not 500.
func TestSubstageCreate_FictitiousStage_NotFound(t *testing.T) {
	progs := twoTenantRepo()
	subs := &fakeSubstageRepo{subs: map[string]*entity.ProgramSubstage{}}
	h := handler.NewProgramSubstageHandler(subs, progs)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	fake := "8ba7b810-9dad-11d1-80b4-00c04fd430c0"
	c, rec := newTenantCtx(e, http.MethodPost, "/api/program-substages",
		`{"program_stage_id":"`+fake+`","name":"Kegiatan Baru"}`, tenantA)
	err := h.Create(c)
	assertAppError(t, err, http.StatusNotFound, "not_found")
	_ = rec
}

// TestSubstageCreate_DuplicateName_Conflict: same name under the same Topik → 409.
func TestSubstageCreate_DuplicateName_Conflict(t *testing.T) {
	progs := twoTenantRepo()
	subs := &fakeSubstageRepo{subs: map[string]*entity.ProgramSubstage{
		subStageID: {BaseModel: entity.BaseModel{ID: subStageID}, ProgramStageID: stageID, Name: "Kegiatan A"},
	}}
	h := handler.NewProgramSubstageHandler(subs, progs)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	c, rec := newTenantCtx(e, http.MethodPost, "/api/program-substages",
		`{"program_stage_id":"`+stageID+`","name":"kegiatan a"}`, tenantA)
	if err := h.Create(c); err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}
}
