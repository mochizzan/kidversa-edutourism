package programstage_test

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
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// stageGuardRepo is an in-memory repository.ProgramRepository behind the
// Tahap 2 step 6 DELETE Topik guard tests. usage is the CountStageUsage
// result; briefs feed ListStageSessionBriefs; deleted counts DeleteStage.
type stageGuardRepo struct {
	repository.ProgramRepository
	program entity.Program
	stage   entity.ProgramStage
	usage   int64
	briefs  []entity.Session
	deleted int
}

func (f *stageGuardRepo) GetProgramByID(context.Context, string) (*entity.Program, error) {
	p := f.program
	return &p, nil
}

func (f *stageGuardRepo) GetStageByID(context.Context, string) (*entity.ProgramStage, error) {
	s := f.stage
	return &s, nil
}

func (f *stageGuardRepo) CountStageUsage(context.Context, string) (int64, error) {
	return f.usage, nil
}

func (f *stageGuardRepo) ListStageSessionBriefs(context.Context, string, int) ([]entity.Session, error) {
	return f.briefs, nil
}

func (f *stageGuardRepo) DeleteStage(context.Context, string) error {
	f.deleted++
	return nil
}

func runStageDelete(t *testing.T, repo repository.ProgramRepository) *httptest.ResponseRecorder {
	t.Helper()
	h := handler.NewProgramHandler(repo, nil)
	e := echo.New()
	req := httptest.NewRequest(http.MethodDelete, "/api/programs/"+programID+"/stages/"+stageID, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{
		{Name: "id", Value: programID},
		{Name: "stageId", Value: stageID},
	})
	if err := h.DeleteStage(c); err != nil {
		t.Fatalf("DeleteStage returned error: %v", err)
	}
	return rec
}

// TestStageDelete_Used_Returns409: a Topik referenced by live rows → 409
// stage_has_sessions with count + short session list; nothing deleted.
func TestStageDelete_Used_Returns409(t *testing.T) {
	repo := &stageGuardRepo{
		program: entity.Program{BaseModel: entity.BaseModel{ID: programID}},
		stage:   entity.ProgramStage{BaseModel: entity.BaseModel{ID: stageID}, ProgramID: programID},
		usage:   3,
		briefs: []entity.Session{
			{BaseModel: entity.BaseModel{ID: "s1"}, Name: "Sesi Satu", Status: entity.SessionActive},
			{BaseModel: entity.BaseModel{ID: "s2"}, Name: "Sesi Dua", Status: entity.SessionDraft},
		},
	}
	rec := runStageDelete(t, repo)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		"stage_has_sessions",
		"3 sesi",
		"s1 (Sesi Satu, ACTIVE)",
		"s2 (Sesi Dua, DRAFT)",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("409 body missing %q; body: %s", want, body)
		}
	}
	if repo.deleted != 0 {
		t.Errorf("409 must not delete: DeleteStage=%d, want 0", repo.deleted)
	}
}

// TestStageDelete_Unused_Succeeds: an unreferenced Topik → 204 via DeleteStage.
func TestStageDelete_Unused_Succeeds(t *testing.T) {
	repo := &stageGuardRepo{
		program: entity.Program{BaseModel: entity.BaseModel{ID: programID}},
		stage:   entity.ProgramStage{BaseModel: entity.BaseModel{ID: stageID}, ProgramID: programID},
		usage:   0,
	}
	rec := runStageDelete(t, repo)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body: %s", rec.Code, rec.Body.String())
	}
	if repo.deleted != 1 {
		t.Errorf("DeleteStage calls = %d, want 1", repo.deleted)
	}
}

// substageGuardRepo is an in-memory ProgramSubstageRepository behind the
// Tahap 2 step 7 DELETE Kegiatan guard tests.
type substageGuardRepo struct {
	repository.ProgramSubstageRepository
	sub     entity.ProgramSubstage
	usage   int64
	briefs  []entity.Session
	deleted int
}

func (f *substageGuardRepo) GetSubstageByID(_ context.Context, id string) (*entity.ProgramSubstage, error) {
	if f.sub.ID == "" {
		return nil, apperrors.NotFound("not_found", errors.New("substage not found"))
	}
	cp := f.sub
	return &cp, nil
}

func (f *substageGuardRepo) CountSubstageUsage(context.Context, string) (int64, error) {
	return f.usage, nil
}

func (f *substageGuardRepo) ListSubstageSessionBriefs(context.Context, string, int) ([]entity.Session, error) {
	return f.briefs, nil
}

func (f *substageGuardRepo) DeleteSubstage(context.Context, string) error {
	f.deleted++
	return nil
}

func runSubstageDelete(t *testing.T, repo *substageGuardRepo) *httptest.ResponseRecorder {
	t.Helper()
	progs := twoTenantRepo()
	h := handler.NewProgramSubstageHandler(repo, progs)
	e := echo.New()
	req := httptest.NewRequest(http.MethodDelete, "/api/program-substages/"+subStageID, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, tenantA)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: subStageID}})
	if err := h.Delete(c); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	return rec
}

// TestSubstageDelete_Used_Returns409: a Kegiatan cloned into live sessions →
// 409 substage_has_sessions; nothing deleted.
func TestSubstageDelete_Used_Returns409(t *testing.T) {
	repo := &substageGuardRepo{
		sub:   entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: subStageID}, ProgramStageID: stageID, Name: "Kegiatan A"},
		usage: 2,
		briefs: []entity.Session{
			{BaseModel: entity.BaseModel{ID: "s1"}, Name: "Sesi Satu", Status: entity.SessionDraft},
		},
	}
	rec := runSubstageDelete(t, repo)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		"substage_has_sessions",
		"2 sesi",
		"s1 (Sesi Satu, DRAFT)",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("409 body missing %q; body: %s", want, body)
		}
	}
	if repo.deleted != 0 {
		t.Errorf("409 must not delete: DeleteSubstage=%d, want 0", repo.deleted)
	}
}

// TestSubstageDelete_Unused_Succeeds: an unused Kegiatan → 204.
func TestSubstageDelete_Unused_Succeeds(t *testing.T) {
	repo := &substageGuardRepo{
		sub:   entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: subStageID}, ProgramStageID: stageID, Name: "Kegiatan A"},
		usage: 0,
	}
	rec := runSubstageDelete(t, repo)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body: %s", rec.Code, rec.Body.String())
	}
	if repo.deleted != 1 {
		t.Errorf("DeleteSubstage calls = %d, want 1", repo.deleted)
	}
}

// TestProgramDeleteForce_CompletedSessions_Refused: ?force=true with a
// COMPLETED session → 409 program_has_completed_sessions; nothing purged.
func TestProgramDeleteForce_CompletedSessions_Refused(t *testing.T) {
	repo := &deleteGuardRepo{
		program: guardedProgram(),
		briefs: []entity.Session{
			{BaseModel: entity.BaseModel{ID: "s1"}, Name: "Sesi Arsip", Status: entity.SessionCompleted},
			{BaseModel: entity.BaseModel{ID: "s2"}, Name: "Sesi Draft", Status: entity.SessionDraft},
		},
	}
	rec := runProgramDelete(t, repo, "true")

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		"program_has_completed_sessions",
		"s1 (Sesi Arsip)",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("409 body missing %q; body: %s", want, body)
		}
	}
	if repo.forced != 0 || repo.deleted != 0 {
		t.Errorf("409 must not delete: Delete=%d DeleteForce=%d, want both 0", repo.deleted, repo.forced)
	}
}

// TestProgramDeleteForce_NoCompletedSessions_Purges: ?force=true with only
// non-COMPLETED sessions still purges via DeleteProgramForce.
func TestProgramDeleteForce_NoCompletedSessions_Purges(t *testing.T) {
	repo := &deleteGuardRepo{
		program: guardedProgram(),
		briefs: []entity.Session{
			{BaseModel: entity.BaseModel{ID: "s2"}, Name: "Sesi Draft", Status: entity.SessionDraft},
		},
	}
	rec := runProgramDelete(t, repo, "true")

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body: %s", rec.Code, rec.Body.String())
	}
	if repo.forced != 1 {
		t.Errorf("DeleteProgramForce calls = %d, want 1", repo.forced)
	}
}

// TestMessageForCode_DeleteGuards pins the new 409 codes to stable
// operational text (never the generic fallback).
func TestMessageForCode_DeleteGuards(t *testing.T) {
	fallback := appresp.MessageForCode("__unknown_audit_code__")
	for _, code := range []string{"stage_has_sessions", "substage_has_sessions", "program_has_completed_sessions"} {
		if got := appresp.MessageForCode(code); got == fallback {
			t.Errorf("MessageForCode(%q) fell back to the default message", code)
		}
	}
}
