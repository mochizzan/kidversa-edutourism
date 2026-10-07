package programstage_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// renameRepo serves whole-table dedup lookups from explicit name sets so the
// Update-path rename tests exercise the exclude-self semantics: taken reports
// true unless the only match is the row being updated.
type renameRepo struct {
	repository.ProgramRepository
	program       entity.Program
	stage         entity.ProgramStage
	programTaken  func(tenantID, name, excludeID string) bool
	stageTaken    func(programID, name, excludeID string) bool
	updated       *entity.Program
	stageUpdated  *entity.ProgramStage
	programStates int
	stageStates   int
}

func (f *renameRepo) GetProgramByID(context.Context, string) (*entity.Program, error) {
	p := f.program
	return &p, nil
}

func (f *renameRepo) GetStageByID(context.Context, string) (*entity.ProgramStage, error) {
	s := f.stage
	return &s, nil
}

func (f *renameRepo) ProgramNameTaken(_ context.Context, tenantID, name, excludeID string) (bool, error) {
	return f.programTaken(tenantID, name, excludeID), nil
}

func (f *renameRepo) StageNameTaken(_ context.Context, programID, name, excludeID string) (bool, error) {
	return f.stageTaken(programID, name, excludeID), nil
}

func (f *renameRepo) UpdateProgram(_ context.Context, p *entity.Program) error {
	f.programStates++
	cp := *p
	f.updated = &cp
	return nil
}

func (f *renameRepo) UpdateStage(_ context.Context, s *entity.ProgramStage) error {
	f.stageStates++
	cp := *s
	f.stageUpdated = &cp
	return nil
}

func renameFixture() *renameRepo {
	return &renameRepo{
		program: entity.Program{BaseModel: entity.BaseModel{ID: programID}, TenantID: new(tenantA), Name: "Program A"},
		stage:   entity.ProgramStage{BaseModel: entity.BaseModel{ID: stageID}, ProgramID: programID, Name: "Topik A"},
		programTaken: func(_, name, excludeID string) bool {
			return excludeID != programID && strings.EqualFold(strings.TrimSpace(name), "program a")
		},
		stageTaken: func(_, name, excludeID string) bool {
			return excludeID != stageID && strings.EqualFold(strings.TrimSpace(name), "topik a")
		},
	}
}

func runProgramUpdate(t *testing.T, repo repository.ProgramRepository, body string) *httptest.ResponseRecorder {
	t.Helper()
	h := handler.NewProgramHandler(repo, nil)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	req := httptest.NewRequest(http.MethodPut, "/api/programs/"+programID, strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, tenantA)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: programID}})
	if err := h.Update(c); err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	return rec
}

// TestProgramUpdate_RenameToTakenName_Conflict: renaming a program onto a
// name another program of the tenant uses → 409 conflict; nothing written.
func TestProgramUpdate_RenameToTakenName_Conflict(t *testing.T) {
	repo := renameFixture()
	// A DIFFERENT program (otherProgramID) owns "Program B": renaming
	// programID onto it must collide (excludeID is programID, not the
	// owner, so the exemption does not apply).
	const otherProgramID = "7ba7b810-9dad-11d1-80b4-00c04fd430c9"
	repo.programTaken = func(_, name, excludeID string) bool {
		return excludeID != otherProgramID && strings.EqualFold(strings.TrimSpace(name), "program b")
	}
	rec := runProgramUpdate(t, repo, `{"name":"Program B"}`)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}
	if repo.programStates != 0 {
		t.Errorf("UpdateProgram calls = %d, want 0 (409 must not write)", repo.programStates)
	}
}

// TestProgramUpdate_KeepOwnName_OK: re-saving the row's own name must NOT
// trip the dedup (exclude-self) → 200 with one write.
func TestProgramUpdate_KeepOwnName_OK(t *testing.T) {
	repo := renameFixture()
	rec := runProgramUpdate(t, repo, `{"name":"Program A","description":"d"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	if repo.programStates != 1 {
		t.Fatalf("UpdateProgram calls = %d, want 1", repo.programStates)
	}
	if repo.updated.Name != "Program A" {
		t.Errorf("Name = %q, want %q", repo.updated.Name, "Program A")
	}
}

// TestUpdateStage_RenameCollision_Conflict pins the collision branch with a
// taken name on the same program → 409, zero writes.
func TestUpdateStage_RenameCollision_Conflict(t *testing.T) {
	repo := renameFixture()
	// A DIFFERENT Topik (otherStageID) owns "Topik B": renaming stageID
	// onto it must collide.
	const otherStageID = "660e8400-e29b-41d4-a716-446655440001"
	repo.stageTaken = func(_, name, excludeID string) bool {
		return excludeID != otherStageID && strings.EqualFold(strings.TrimSpace(name), "topik b")
	}
	rec := runUpdateStage(t, repo, `{"name":"Topik B","content_type":"VIDEO"}`)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}
	if repo.stageStates != 0 {
		t.Errorf("UpdateStage calls = %d, want 0 (409 must not write)", repo.stageStates)
	}
}

// TestUpdateStage_KeepOwnName_OK: re-saving the row's own name skips the
// collision (exclude-self) → 200 with one write.
func TestUpdateStage_KeepOwnName_OK(t *testing.T) {
	repo := renameFixture()
	rec := runUpdateStage(t, repo, `{"name":"Topik A","content_type":"VIDEO"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	if repo.stageStates != 1 {
		t.Fatalf("UpdateStage calls = %d, want 1", repo.stageStates)
	}
}

// renameSubstageRepo serves Kegiatan dedup lookups for the rename tests.
type renameSubstageRepo struct {
	repository.ProgramSubstageRepository
	sub     entity.ProgramSubstage
	taken   func(programStageID, name, excludeID string) bool
	updated *entity.ProgramSubstage
	writes  int
}

func (f *renameSubstageRepo) GetSubstageByID(context.Context, string) (*entity.ProgramSubstage, error) {
	s := f.sub
	return &s, nil
}

func (f *renameSubstageRepo) SubstageNameTaken(_ context.Context, programStageID, name, excludeID string) (bool, error) {
	return f.taken(programStageID, name, excludeID), nil
}

func (f *renameSubstageRepo) UpdateSubstage(_ context.Context, s *entity.ProgramSubstage) error {
	f.writes++
	cp := *s
	f.updated = &cp
	return nil
}

func runSubstageUpdate(t *testing.T, repo *renameSubstageRepo, progs repository.ProgramRepository, body string) *httptest.ResponseRecorder {
	t.Helper()
	h := handler.NewProgramSubstageHandler(repo, progs)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	req := httptest.NewRequest(http.MethodPut, "/api/program-substages/"+subStageID, strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, tenantA)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: subStageID}})
	if err := h.Update(c); err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	return rec
}

// TestSubstageUpdate_RenameCollision_Conflict: renaming a Kegiatan onto a
// name another Kegiatan of the Topik uses → 409, zero writes.
func TestSubstageUpdate_RenameCollision_Conflict(t *testing.T) {
	progs := twoTenantRepo()
	repo := &renameSubstageRepo{
		sub: entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: subStageID}, ProgramStageID: stageID, Name: "Kegiatan A"},
		// A DIFFERENT Kegiatan (otherSubID) owns "Kegiatan B": renaming
		// subStageID onto it must collide.
		taken: func(_, name, excludeID string) bool {
			const otherSubID = "770e8400-e29b-41d4-a716-446655440002"
			return excludeID != otherSubID && strings.EqualFold(strings.TrimSpace(name), "kegiatan b")
		},
	}
	rec := runSubstageUpdate(t, repo, progs, `{"program_stage_id":"`+stageID+`","name":"Kegiatan B"}`)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}
	if repo.writes != 0 {
		t.Errorf("UpdateSubstage calls = %d, want 0 (409 must not write)", repo.writes)
	}
}

// TestSubstageUpdate_KeepOwnName_OK: re-saving the row's own name skips the
// collision (exclude-self) → 200 with one write.
func TestSubstageUpdate_KeepOwnName_OK(t *testing.T) {
	progs := twoTenantRepo()
	repo := &renameSubstageRepo{
		sub: entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: subStageID}, ProgramStageID: stageID, Name: "Kegiatan A"},
		taken: func(_, name, excludeID string) bool {
			return excludeID != subStageID && strings.EqualFold(strings.TrimSpace(name), "kegiatan a")
		},
	}
	rec := runSubstageUpdate(t, repo, progs, `{"program_stage_id":"`+stageID+`","name":"Kegiatan A"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	if repo.writes != 1 {
		t.Fatalf("UpdateSubstage calls = %d, want 1", repo.writes)
	}
}

// forceScanRepo serves the force-delete guard with MANY sessions where the
// only COMPLETED row sits beyond the old 100-window: the whole-table count
// must still refuse the purge.
type forceScanRepo struct {
	repository.ProgramRepository
	program   entity.Program
	completed int64
	briefs    []entity.Session
	forced    int
}

func (f *forceScanRepo) GetProgramByID(context.Context, string) (*entity.Program, error) {
	p := f.program
	return &p, nil
}

func (f *forceScanRepo) CountCompletedSessions(context.Context, string) (int64, error) {
	return f.completed, nil
}

func (f *forceScanRepo) ListProgramSessionBriefs(context.Context, string, int) ([]entity.Session, error) {
	return f.briefs, nil
}

func (f *forceScanRepo) DeleteProgramForce(context.Context, string) error {
	f.forced++
	return nil
}

// TestProgramDeleteForce_CompletedBeyondWindow_Refused: a COMPLETED session
// outside any LIMIT window still refuses ?force=true → 409 with the true
// whole-table count; nothing purged.
func TestProgramDeleteForce_CompletedBeyondWindow_Refused(t *testing.T) {
	repo := &forceScanRepo{
		program:   guardedProgram(),
		completed: 1,
		briefs:    []entity.Session{},
	}
	rec := runProgramDelete(t, repo, "true")

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body: %s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "program_has_completed_sessions") {
		t.Errorf("409 body missing code; body: %s", body)
	}
	if repo.forced != 0 {
		t.Errorf("DeleteProgramForce calls = %d, want 0", repo.forced)
	}
}

// TestProgramDeleteForce_NoCompletedAnywhere_Purges: zero COMPLETED over the
// whole table → 204 via the purge path.
func TestProgramDeleteForce_NoCompletedAnywhere_Purges(t *testing.T) {
	repo := &forceScanRepo{
		program:   guardedProgram(),
		completed: 0,
		briefs:    []entity.Session{},
	}
	rec := runProgramDelete(t, repo, "true")

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body: %s", rec.Code, rec.Body.String())
	}
	if repo.forced != 1 {
		t.Errorf("DeleteProgramForce calls = %d, want 1", repo.forced)
	}
}
