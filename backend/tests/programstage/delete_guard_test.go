package programstage_test

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

// deleteGuardRepo implements repository.ProgramRepository for the
// DELETE /api/programs/:id guard tests (audit #1). Only the methods the
// handler exercises are implemented; everything else is promoted from a nil
// embedded interface and panics loudly if an unexpected call arrives.
type deleteGuardRepo struct {
	repository.ProgramRepository
	program    entity.Program
	count      int64
	briefs     []entity.Session
	deleted    int
	forced     int
	countCalls int
}

func (f *deleteGuardRepo) GetProgramByID(context.Context, string) (*entity.Program, error) {
	p := f.program
	return &p, nil
}

func (f *deleteGuardRepo) CountProgramSessions(context.Context, string) (int64, error) {
	f.countCalls++
	return f.count, nil
}

func (f *deleteGuardRepo) ListProgramSessionBriefs(context.Context, string, int) ([]entity.Session, error) {
	return f.briefs, nil
}

func (f *deleteGuardRepo) DeleteProgram(context.Context, string) error {
	f.deleted++
	return nil
}

func (f *deleteGuardRepo) DeleteProgramForce(context.Context, string) error {
	f.forced++
	return nil
}

func guardedProgram() entity.Program {
	return entity.Program{BaseModel: entity.BaseModel{ID: programID}}
}

// runProgramDelete performs one DELETE /api/programs/:id through
// ProgramHandler.Delete. force is appended as ?force=... when non-empty.
func runProgramDelete(t *testing.T, repo repository.ProgramRepository, force string) *httptest.ResponseRecorder {
	t.Helper()
	h := handler.NewProgramHandler(repo, nil)
	e := echo.New()
	target := "/api/programs/" + programID
	if force != "" {
		target += "?force=" + force
	}
	req := httptest.NewRequest(http.MethodDelete, target, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{
		{Name: "id", Value: programID},
	})
	if err := h.Delete(c); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	return rec
}

// TestProgramDelete_NoSessions_SucceedsWithoutForce: a program that owns no
// sessions must still be deletable without ?force — 204 via the normal
// (soft) delete path, after the guard counted zero sessions.
func TestProgramDelete_NoSessions_SucceedsWithoutForce(t *testing.T) {
	repo := &deleteGuardRepo{program: guardedProgram(), count: 0}
	rec := runProgramDelete(t, repo, "")

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body: %s", rec.Code, rec.Body.String())
	}
	if repo.countCalls != 1 {
		t.Errorf("CountProgramSessions calls = %d, want 1 (guard must run)", repo.countCalls)
	}
	if repo.deleted != 1 || repo.forced != 0 {
		t.Errorf("Delete=%d DeleteForce=%d, want Delete=1 DeleteForce=0", repo.deleted, repo.forced)
	}
}

// TestProgramDelete_WithSessions_Returns409WithCountAndList: a program that
// still owns sessions (any status) must be refused with 409
// program_has_sessions carrying the exact count and a short session list
// (id, name, status); nothing may be deleted.
func TestProgramDelete_WithSessions_Returns409WithCountAndList(t *testing.T) {
	repo := &deleteGuardRepo{
		program: guardedProgram(),
		count:   2,
		briefs: []entity.Session{
			{BaseModel: entity.BaseModel{ID: "s1"}, Name: "Sesi Satu", Status: entity.SessionDraft},
			{BaseModel: entity.BaseModel{ID: "s2"}, Name: "Sesi Dua", Status: entity.SessionCompleted},
		},
	}
	rec := runProgramDelete(t, repo, "")

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		"program_has_sessions",
		"2 sesi",
		"s1 (Sesi Satu, DRAFT)",
		"s2 (Sesi Dua, COMPLETED)",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("409 body missing %q; body: %s", want, body)
		}
	}
	if repo.deleted != 0 || repo.forced != 0 {
		t.Errorf("409 must not delete: Delete=%d DeleteForce=%d, want both 0", repo.deleted, repo.forced)
	}
}

// TestProgramDelete_Force_PurgesWithoutGuard: ?force=true must skip the
// guard entirely and route to the transactional hard-delete path.
func TestProgramDelete_Force_PurgesWithoutGuard(t *testing.T) {
	repo := &deleteGuardRepo{
		program: guardedProgram(),
		count:   3, // guard data must NOT be consulted on the force path
	}
	rec := runProgramDelete(t, repo, "true")

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body: %s", rec.Code, rec.Body.String())
	}
	if repo.forced != 1 {
		t.Errorf("DeleteProgramForce calls = %d, want 1", repo.forced)
	}
	if repo.deleted != 0 {
		t.Errorf("soft DeleteProgram calls = %d, want 0 on the force path", repo.deleted)
	}
	if repo.countCalls != 0 {
		t.Errorf("CountProgramSessions calls = %d, want 0 (force skips the guard)", repo.countCalls)
	}
}
