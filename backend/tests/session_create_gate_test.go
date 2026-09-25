package auth_test

import (
	"context"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/usecase"
)

// ---------------------------------------------------------------------------
// Fakes for the session-create strict gate. Embed the repository interfaces
// so only the methods exercised by CreateSession carry real state; any other
// method panics on the nil embedded interface, keeping the test honest about
// which repository calls the usecase makes.
// ---------------------------------------------------------------------------

type fakeCreateGateSessionRepo struct {
	repository.SessionRepository
	created bool
}

func (r *fakeCreateGateSessionRepo) Transaction(_ context.Context, fn func(tx repository.SessionRepository) error) error {
	return fn(r)
}

func (r *fakeCreateGateSessionRepo) CreateSession(_ context.Context, s *entity.Session) error {
	s.ID = "session-1"
	r.created = true
	return nil
}

func (r *fakeCreateGateSessionRepo) CreateSessionStage(context.Context, *entity.SessionStage) error {
	return nil
}

func (r *fakeCreateGateSessionRepo) ListSessionStages(context.Context, string) ([]entity.SessionStage, error) {
	return []entity.SessionStage{}, nil
}

type fakeProgramReader struct {
	programs map[string]bool
}

func (r *fakeProgramReader) GetProgramByID(_ context.Context, id string) (*entity.Program, error) {
	if r.programs[id] {
		return &entity.Program{BaseModel: entity.BaseModel{ID: id}}, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

type fakeStageReader struct {
	stages []entity.ProgramStage
}

func (r *fakeStageReader) ListStages(context.Context, string) ([]entity.ProgramStage, error) {
	return r.stages, nil
}

type fakeSubstageReader struct {
	subs map[string][]entity.ProgramSubstage
}

func (r *fakeSubstageReader) ListSubstages(_ context.Context, stageID string) ([]entity.ProgramSubstage, error) {
	return r.subs[stageID], nil
}

type fakeCreateGateSessionSubstageRepo struct {
	repository.SessionSubstageRepository
}

func (r *fakeCreateGateSessionSubstageRepo) CreateSessionSubstage(context.Context, *entity.SessionSubstage) error {
	return nil
}

func newCreateGateUsecase(sessRepo *fakeCreateGateSessionRepo, progExists bool, stages []entity.ProgramStage, subs map[string][]entity.ProgramSubstage) *usecase.SessionUsecase {
	progReader := &fakeProgramReader{programs: map[string]bool{}}
	if progExists {
		progReader.programs["program-1"] = true
	}
	uc := usecase.NewSessionUsecase(sessRepo, &fakeStageReader{stages: stages})
	uc.SetProgramReader(progReader)
	uc.SetSubstageRepos(&fakeSubstageReader{subs: subs}, &fakeCreateGateSessionSubstageRepo{})
	return uc
}

func stageWithID(id string) entity.ProgramStage {
	return entity.ProgramStage{BaseModel: entity.BaseModel{ID: id}, ProgramID: "program-1"}
}

func subWithID(id, stageID string) entity.ProgramSubstage {
	return entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: id}, ProgramStageID: stageID}
}

func TestCreateSession_GhostProgram(t *testing.T) {
	sessRepo := &fakeCreateGateSessionRepo{}
	uc := newCreateGateUsecase(sessRepo, false, nil, nil)

	s, err := uc.CreateSession(context.Background(), "tenant-1", "user-1", "program-1", "Sesi", "2026-01-01", "", "", "", "")
	requireAppErrorCode(t, err, "not_found")
	if s != nil {
		t.Fatalf("expected nil session on ghost program, got %+v", s)
	}
	if sessRepo.created {
		t.Fatalf("session persisted despite ghost program")
	}
}

func TestCreateSession_ProgramWithNoTopics(t *testing.T) {
	sessRepo := &fakeCreateGateSessionRepo{}
	uc := newCreateGateUsecase(sessRepo, true, []entity.ProgramStage{}, nil)

	s, err := uc.CreateSession(context.Background(), "tenant-1", "user-1", "program-1", "Sesi", "2026-01-01", "", "", "", "")
	requireAppErrorCode(t, err, "program_has_no_topics")
	if s != nil {
		t.Fatalf("expected nil session on empty program, got %+v", s)
	}
	if sessRepo.created {
		t.Fatalf("session persisted despite program having no topics")
	}
}

func TestCreateSession_TopicWithNoActivities(t *testing.T) {
	sessRepo := &fakeCreateGateSessionRepo{}
	stages := []entity.ProgramStage{stageWithID("stage-1"), stageWithID("stage-2")}
	subs := map[string][]entity.ProgramSubstage{
		"stage-1": {subWithID("sub-1", "stage-1")},
		"stage-2": {},
	}
	uc := newCreateGateUsecase(sessRepo, true, stages, subs)

	s, err := uc.CreateSession(context.Background(), "tenant-1", "user-1", "program-1", "Sesi", "2026-01-01", "", "", "", "")
	requireAppErrorCode(t, err, "topic_has_no_activities")
	if s != nil {
		t.Fatalf("expected nil session on topic with no activities, got %+v", s)
	}
	if sessRepo.created {
		t.Fatalf("session persisted despite topic having no activities")
	}
}

func TestCreateSession_CompleteProgram_Succeeds(t *testing.T) {
	sessRepo := &fakeCreateGateSessionRepo{}
	stages := []entity.ProgramStage{stageWithID("stage-1"), stageWithID("stage-2")}
	subs := map[string][]entity.ProgramSubstage{
		"stage-1": {subWithID("sub-1", "stage-1")},
		"stage-2": {subWithID("sub-2", "stage-2")},
	}
	uc := newCreateGateUsecase(sessRepo, true, stages, subs)

	s, err := uc.CreateSession(context.Background(), "tenant-1", "user-1", "program-1", "Sesi", "2026-01-01", "", "", "", "")
	if err != nil {
		t.Fatalf("expected success for complete program, got %v", err)
	}
	if s == nil {
		t.Fatalf("expected non-nil session on success")
	}
	if !sessRepo.created {
		t.Fatalf("expected session to be persisted on success")
	}
}
