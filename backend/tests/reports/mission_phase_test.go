package reports_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/reports"
)

// missionBankFake is a MissionBankRepository whose List returns a fixed
// candidate set, or an injected error for the recommender-failure case.
type missionBankFake struct {
	repository.MissionBankRepository
	mu      sync.Mutex
	items   []entity.MissionBank
	listErr error
}

func (f *missionBankFake) List(_ context.Context, _ repository.MissionBankFilter, _, _ int) (*repository.Paginated[entity.MissionBank], error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.listErr != nil {
		return nil, f.listErr
	}
	out := make([]entity.MissionBank, len(f.items))
	copy(out, f.items)
	return &repository.Paginated[entity.MissionBank]{Items: out, Total: len(out)}, nil
}

// assessmentListFake returns an empty assessment page; with no LLM client
// wired the recommender falls back to the deterministic heuristic.
type assessmentListFake struct {
	repository.AssessmentRepository
}

func (f *assessmentListFake) List(context.Context, repository.AssessmentFilter, int, int) (*repository.Paginated[entity.Assessment], error) {
	return &repository.Paginated[entity.Assessment]{}, nil
}

// participantMissionFake records every ReplaceByReport persist call — the
// single persistence route for mission selections (SaveMissions/Approve).
type participantMissionFake struct {
	repository.ParticipantMissionRepository
	mu    sync.Mutex
	calls map[string][][]string // reportID → sequence of persisted mission-id slices
}

func newParticipantMissionFake() *participantMissionFake {
	return &participantMissionFake{calls: map[string][][]string{}}
}

func (f *participantMissionFake) ReplaceByReport(_ context.Context, _, reportID string, items []entity.ParticipantMission) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	ids := make([]string, 0, len(items))
	for _, it := range items {
		ids = append(ids, it.MissionBankID)
	}
	f.calls[reportID] = append(f.calls[reportID], ids)
	return nil
}

func (f *participantMissionFake) persistedCount(reportID string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls[reportID])
}

func (f *participantMissionFake) lastPersist(reportID string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	calls := f.calls[reportID]
	if len(calls) == 0 {
		return nil
	}
	return calls[len(calls)-1]
}

// markTopicScoped scopes every seeded report to the given Topik so the
// mission recommender (which requires program_stage_id) can run on them.
func markTopicScoped(repo *genRepo, stageID string) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	for id, r := range repo.byID {
		r.ProgramStageID = stageID
		repo.byID[id] = r
	}
}

// newMissionUsecase wires the generate fixture with the mission-phase
// dependencies (LLM client left nil → deterministic heuristic path).
func newMissionUsecase(repo *genRepo, gen *blockingGen, sess *genSessionRepo, bank repository.MissionBankRepository, pm repository.ParticipantMissionRepository) *reports.Usecase {
	cfg := &config.Config{ParentReportBaseURL: "http://localhost/parent/report", ReportTokenTTL: 168 * time.Hour}
	return reports.NewUsecase(repo, gen, nil, bank, &assessmentListFake{}, sess, nil, pm, nil, nil, nil, cfg, nil, nil, &attendanceRowsFake{})
}

// waitMissionPersist waits until every wanted report has at least one
// ReplaceByReport persist recorded.
func waitMissionPersist(t *testing.T, pm *participantMissionFake, want ...string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		ok := true
		for _, id := range want {
			if pm.persistedCount(id) == 0 {
				ok = false
			}
		}
		if ok {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("timeout waiting for mission persist of %v", want)
}

// TestGenerateForSessionSelectsAndPersistsMissions: worklist reports without
// missions get the recommender (SuggestMissions) and its result is persisted
// through the existing ReplaceByReport path — while the narrative phase runs
// unchanged and no failure is recorded.
func TestGenerateForSessionSelectsAndPersistsMissions(t *testing.T) {
	repo := newGenRepo("p-a", "p-b")
	markTopicScoped(repo, "stage1")
	gen := newBlockingGen("r-p-a", "r-p-b")
	sess := &genSessionRepo{participants: newParticipants(2)}
	bank := &missionBankFake{items: []entity.MissionBank{
		{BaseModel: entity.BaseModel{ID: "m-1"}, Title: "Misi Satu"},
		{BaseModel: entity.BaseModel{ID: "m-2"}, Title: "Misi Dua"},
	}}
	pm := newParticipantMissionFake()
	uc := newMissionUsecase(repo, gen, sess, bank, pm)
	participants := newParticipants(2)

	done := make(chan error, 1)
	go func() {
		_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, participants, nil)
		done <- err
	}()

	// Mission phase persists both reports from the bank's candidate set
	// (heuristic fallback keeps candidate order).
	waitMissionPersist(t, pm, "r-p-a", "r-p-b")
	for _, id := range []string{"r-p-a", "r-p-b"} {
		if got := pm.lastPersist(id); !equalStrings(got, []string{"m-1", "m-2"}) {
			t.Errorf("persisted missions for %s = %v, want [m-1 m-2]", id, got)
		}
	}
	if st, ok := uc.GenerateStatus(genSessionID, testTenantID); ok && len(st.Failed) > 0 {
		t.Errorf("no failure expected, registry Failed = %v", st.Failed)
	}

	// Release the narrative workers → run completes, registry cleaned up.
	close(gen.blocks["r-p-a"])
	close(gen.blocks["r-p-b"])
	if err := <-done; err != nil {
		t.Fatalf("GenerateForSession returned error: %v", err)
	}
	if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
		t.Fatal("generate registry must be empty after a successful run")
	}
	// Narrative phase ran as before: drafts persisted for both reports.
	for _, id := range []string{"r-p-a", "r-p-b"} {
		r, err := repo.GetByID(context.Background(), id, testTenantID)
		if err != nil {
			t.Fatalf("GetByID(%s): %v", id, err)
		}
		if r.AINarrativeDraft != "draft" {
			t.Errorf("narrative draft for %s = %q, want %q", id, r.AINarrativeDraft, "draft")
		}
	}
}

// TestGenerateForSessionKeepsExistingMissionSelection: a report that already
// has persisted missions is skipped by the mission phase — its selection is
// never overwritten (mirrors the narrative rule of only filling empty drafts).
func TestGenerateForSessionKeepsExistingMissionSelection(t *testing.T) {
	repo := newGenRepo("p-a", "p-b")
	markTopicScoped(repo, "stage1")
	repo.mu.Lock()
	r := repo.byID["r-p-a"]
	r.MissionIDs = []string{"m-existing"}
	repo.byID["r-p-a"] = r
	repo.mu.Unlock()

	gen := newBlockingGen("r-p-a", "r-p-b")
	sess := &genSessionRepo{participants: newParticipants(2)}
	bank := &missionBankFake{items: []entity.MissionBank{
		{BaseModel: entity.BaseModel{ID: "m-1"}, Title: "Misi Satu"},
		{BaseModel: entity.BaseModel{ID: "m-2"}, Title: "Misi Dua"},
	}}
	pm := newParticipantMissionFake()
	uc := newMissionUsecase(repo, gen, sess, bank, pm)
	participants := newParticipants(2)

	done := make(chan error, 1)
	go func() {
		_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, participants, nil)
		done <- err
	}()

	// Only the mission-less report gets a selection.
	waitMissionPersist(t, pm, "r-p-b")

	close(gen.blocks["r-p-a"])
	close(gen.blocks["r-p-b"])
	if err := <-done; err != nil {
		t.Fatalf("GenerateForSession returned error: %v", err)
	}
	if pm.persistedCount("r-p-a") != 0 {
		t.Errorf("report with existing missions must not be re-persisted (got %d calls)", pm.persistedCount("r-p-a"))
	}
	got, err := repo.GetByID(context.Background(), "r-p-a", testTenantID)
	if err != nil {
		t.Fatalf("GetByID(r-p-a): %v", err)
	}
	if !equalStrings(got.MissionIDs, []string{"m-existing"}) {
		t.Errorf("existing missions = %v, want [m-existing]", got.MissionIDs)
	}
	if ids := pm.lastPersist("r-p-b"); !equalStrings(ids, []string{"m-1", "m-2"}) {
		t.Errorf("persisted missions for r-p-b = %v, want [m-1 m-2]", ids)
	}
}

// TestGenerateMissionPhaseFailuresMarkRegistry: an empty mission bank (zero
// candidates) and a recommender error both record a clear per-item failure in
// the generation registry — never silent, never a panic — while the narrative
// phase still completes and the run still returns success for that item.
func TestGenerateMissionPhaseFailuresMarkRegistry(t *testing.T) {
	cases := []struct {
		name    string
		bank    *missionBankFake
		wantMsg string
	}{
		{name: "empty mission bank", bank: &missionBankFake{}, wantMsg: "kandidat misi kosong"},
		{name: "recommender error", bank: &missionBankFake{listErr: errors.New("mission bank down")}, wantMsg: "mission_selection_failed"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newGenRepo("p-a")
			markTopicScoped(repo, "stage1")
			gen := newBlockingGen("r-p-a")
			sess := &genSessionRepo{participants: newParticipants(1)}
			pm := newParticipantMissionFake()
			uc := newMissionUsecase(repo, gen, sess, tc.bank, pm)

			done := make(chan error, 1)
			go func() {
				_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, newParticipants(1), nil)
				done <- err
			}()

			st := pollGenerate(t, uc, genSessionID, testTenantID,
				func(st reports.GenerateStatus, ok bool) bool {
					return ok && st.Failed["r-p-a"] != ""
				}, "mission failure recorded in registry")
			if !strings.Contains(st.Failed["r-p-a"], tc.wantMsg) {
				t.Errorf("failed message = %q, want it to contain %q", st.Failed["r-p-a"], tc.wantMsg)
			}
			if pm.persistedCount("r-p-a") != 0 {
				t.Error("a failed selection must not persist missions")
			}

			// The narrative phase is unaffected: its worker still runs and the
			// run returns without error.
			close(gen.blocks["r-p-a"])
			if err := <-done; err != nil {
				t.Fatalf("mission failure must not fail the run: %v", err)
			}
			r, gerr := repo.GetByID(context.Background(), "r-p-a", testTenantID)
			if gerr != nil {
				t.Fatalf("GetByID(r-p-a): %v", gerr)
			}
			if r.AINarrativeDraft != "draft" {
				t.Errorf("narrative draft = %q, want %q", r.AINarrativeDraft, "draft")
			}
			if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
				t.Fatal("registry must be cleaned up after the run")
			}
		})
	}
}

// TestGenerateOneRunsMissionPhase: POST /api/reports/generate with a
// participant_id (the per-row "generate one" path) runs the same mission
// phase — only the targeted participant's report is selected and persisted;
// other participants' reports are untouched.
func TestGenerateOneRunsMissionPhase(t *testing.T) {
	pa := "11111111-1111-1111-1111-111111111111"
	pb := "22222222-2222-2222-2222-222222222222"
	participants := []entity.Participant{
		{BaseModel: entity.BaseModel{ID: pa}, ChildName: "Anak A", ParentName: "Ortu A", ParentPhone: "+62 812-3456-7890"},
		{BaseModel: entity.BaseModel{ID: pb}, ChildName: "Anak B", ParentName: "Ortu B", ParentPhone: "+62 812-3456-7891"},
	}

	repo := newGenRepo(pa, pb)
	markTopicScoped(repo, "stage1")
	gen := newBlockingGen("r-"+pa, "r-"+pb)
	sess := &genSessionRepo{
		participants: participants,
		stages: []entity.SessionStage{
			{BaseModel: entity.BaseModel{ID: "ss1"}, ProgramStageID: "stage1"},
		},
	}
	bank := &missionBankFake{items: []entity.MissionBank{
		{BaseModel: entity.BaseModel{ID: "m-1"}, Title: "Misi Satu"},
		{BaseModel: entity.BaseModel{ID: "m-2"}, Title: "Misi Dua"},
	}}
	pm := newParticipantMissionFake()
	uc := newMissionUsecase(repo, gen, sess, bank, pm)

	cfg := &config.Config{ParentReportBaseURL: "http://localhost/parent/report", ReportTokenTTL: 168 * time.Hour}
	h := handler.NewReportHandler(uc, cfg, sess, sse.NewHub(), nil, nil)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()

	// Async contract: the handler answers 202 immediately; the run continues
	// in the background worker (mission persist below proves it runs).
	req := httptest.NewRequest(http.MethodPost, "/api/reports/generate",
		strings.NewReader(`{"session_id":"`+genSessionID+`","participant_id":"`+pa+`"}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, testTenantID)
	if err := h.GenerateForSession(c); err != nil {
		t.Fatalf("generate handler returned error: %v", err)
	}
	if rec.Code != http.StatusAccepted {
		t.Fatalf("generate handler status = %d, want 202", rec.Code)
	}

	waitMissionPersist(t, pm, "r-"+pa)
	if ids := pm.lastPersist("r-" + pa); !equalStrings(ids, []string{"m-1", "m-2"}) {
		t.Errorf("persisted missions for %s = %v, want [m-1 m-2]", "r-"+pa, ids)
	}
	if n := pm.persistedCount("r-" + pb); n != 0 {
		t.Errorf("non-target participant report got %d mission persists, want 0", n)
	}

	close(gen.blocks["r-"+pa])
	// The 202 no longer means "done": wait for the worker to drop the run.
	pollGenerate(t, uc, genSessionID, testTenantID,
		func(_ reports.GenerateStatus, ok bool) bool { return !ok }, "async run cleanup")
	if n := pm.persistedCount("r-" + pb); n != 0 {
		t.Errorf("non-target participant report got %d mission persists after run, want 0", n)
	}
}

// missionLLMFake is a MissionLLMClient whose ChatCompletion returns a fixed
// reply or an injected error — standing in for an upstream LLM outage
// (error/timeout) and for an unusable model response.
type missionLLMFake struct {
	resp string
	err  error
}

func (f *missionLLMFake) ChatCompletion(context.Context, string, string) (string, error) {
	if f.err != nil {
		return "", f.err
	}
	return f.resp, nil
}

// newMissionUsecaseWithAI wires the mission-phase fixture with an LLM client
// and the program repository the real suggestViaLLM path needs, so the
// recommender reaches ChatCompletion instead of short-circuiting on a nil
// ai client (the plain newMissionUsecase heuristic path).
func newMissionUsecaseWithAI(
	repo *genRepo,
	gen *blockingGen,
	sess *genSessionRepo,
	bank repository.MissionBankRepository,
	pm repository.ParticipantMissionRepository,
	llm reports.MissionLLMClient,
) *reports.Usecase {
	cfg := &config.Config{ParentReportBaseURL: "http://localhost/parent/report", ReportTokenTTL: 168 * time.Hour}
	prog := &viewProgramRepo{stages: map[string]*entity.ProgramStage{
		"stage1": {BaseModel: entity.BaseModel{ID: "stage1"}, Name: "Topik 1", SequenceOrder: 1},
	}}
	return reports.NewUsecase(repo, gen, llm, bank, &assessmentListFake{}, sess, prog, pm, nil, nil, nil, cfg, nil, nil, &attendanceRowsFake{})
}

// TestGenerateMissionPhaseLLMFallback: an LLM upstream failure (error/timeout)
// or an unusable reply (non-JSON garbage / hallucinated ids) falls back to the
// deterministic heuristic — the mission phase still succeeds, persists
// candidate-order ids, and records NO registry failure. A valid model pick is
// used verbatim, proving the heuristic only kicks in when the AI path fails.
func TestGenerateMissionPhaseLLMFallback(t *testing.T) {
	cases := []struct {
		name string
		llm  *missionLLMFake
		want []string
	}{
		{name: "llm upstream error", llm: &missionLLMFake{err: context.DeadlineExceeded}, want: []string{"m-1", "m-2"}},
		{name: "llm reply not json", llm: &missionLLMFake{resp: "maaf, saya tidak bisa"}, want: []string{"m-1", "m-2"}},
		{name: "llm hallucinated ids only", llm: &missionLLMFake{resp: `["ghost-1", "ghost-2"]`}, want: []string{"m-1", "m-2"}},
		{name: "llm valid pick", llm: &missionLLMFake{resp: `["m-2"]`}, want: []string{"m-2"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newGenRepo("p-a")
			markTopicScoped(repo, "stage1")
			gen := newBlockingGen("r-p-a")
			sess := &genSessionRepo{participants: newParticipants(1)}
			bank := &missionBankFake{items: []entity.MissionBank{
				{BaseModel: entity.BaseModel{ID: "m-1"}, Title: "Misi Satu"},
				{BaseModel: entity.BaseModel{ID: "m-2"}, Title: "Misi Dua"},
			}}
			pm := newParticipantMissionFake()
			uc := newMissionUsecaseWithAI(repo, gen, sess, bank, pm, tc.llm)

			done := make(chan error, 1)
			go func() {
				_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, newParticipants(1), nil)
				done <- err
			}()

			waitMissionPersist(t, pm, "r-p-a")
			if got := pm.lastPersist("r-p-a"); !equalStrings(got, tc.want) {
				t.Errorf("persisted missions = %v, want %v", got, tc.want)
			}
			// Fallback and good pick alike: the mission phase never records a
			// failure — the narrative worker is still blocked, so the run lives.
			st, ok := uc.GenerateStatus(genSessionID, testTenantID)
			if !ok {
				t.Fatal("registry must still be live while the narrative worker runs")
			}
			if msg := st.Failed["r-p-a"]; msg != "" {
				t.Errorf("unexpected mission-phase failure recorded: %q", msg)
			}

			close(gen.blocks["r-p-a"])
			if err := <-done; err != nil {
				t.Fatalf("GenerateForSession returned error: %v", err)
			}
		})
	}
}
