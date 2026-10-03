package reports_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/reports"
)

// UUID-shaped topic ids (topic_id passes a `uuid` validator on the wire).
const (
	topicA     = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	topicB     = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	topicC     = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	topicNone  = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" // valid uuid, not in the session
	topicScope = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" // second in-scope topic (test 1)
)

// seedTopicReport inserts a pre-existing report row scoped to a topic.
func seedTopicReport(repo *genRepo, id, participantID, stageID string) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	repo.byID[id] = entity.Report{
		BaseModel:      entity.BaseModel{ID: id},
		ParticipantID:  participantID,
		SessionID:      genSessionID,
		ProgramStageID: stageID,
		Status:         entity.ReportDraft,
	}
}

// rowsForStage counts a participant's rows scoped to one topic.
func rowsForStage(repo *genRepo, participantID, stageID string) int {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	n := 0
	for _, r := range repo.byID {
		if r.ParticipantID == participantID && r.ProgramStageID == stageID {
			n++
		}
	}
	return n
}

// TestGenerateForSessionScopedToTopicIDs: a multi-topic generate run pinned to
// a SUBSET of the session's topics must generate exactly those topics — the
// other topic's report never enters the registry worklist, never gets a
// narrative, and never gets missions persisted, and no extra draft row is
// created for it.
func TestGenerateForSessionScopedToTopicIDs(t *testing.T) {
	repo := newGenRepo()
	seedTopicReport(repo, "ra", "p-a", topicA)
	seedTopicReport(repo, "rb", "p-a", topicB) // out of scope
	seedTopicReport(repo, "rc", "p-a", topicScope)
	gen := newBlockingGen("ra", "rc") // a narrative call for rb would surface below
	sess := &genSessionRepo{participants: newParticipants(1)}
	bank := &missionBankFake{items: []entity.MissionBank{
		{BaseModel: entity.BaseModel{ID: "m-1"}, Title: "Misi Satu"},
	}}
	pm := newParticipantMissionFake()
	uc := newMissionUsecase(repo, gen, sess, bank, pm)

	done := make(chan error, 1)
	go func() {
		_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID,
			newParticipants(1), []string{topicA, topicScope})
		done <- err
	}()

	// Only the in-scope reports start a narrative worker.
	started := waitStarted(t, gen, 2)
	if !equalStrings(started, []string{"ra", "rc"}) {
		t.Fatalf("started workers = %v, want exactly [ra rc] (out-of-scope report must not run)", started)
	}

	// The registry worklist contains only the two in-scope reports.
	st, ok := uc.GenerateStatus(genSessionID, testTenantID)
	if !ok {
		t.Fatal("registry must be live while the narrative workers run")
	}
	if st.Total != 2 {
		t.Errorf("worklist total = %d, want 2 (topic-scoped)", st.Total)
	}
	if it := findItem(st, "rb"); it != nil {
		t.Errorf("out-of-scope report rb must not be registered, got %+v", it)
	}

	// Missions persist only for the in-scope reports.
	waitMissionPersist(t, pm, "ra", "rc")
	if n := pm.persistedCount("rb"); n != 0 {
		t.Errorf("out-of-scope report rb got %d mission persists, want 0", n)
	}

	close(gen.blocks["ra"])
	close(gen.blocks["rc"])
	if err := <-done; err != nil {
		t.Fatalf("GenerateForSession returned error: %v", err)
	}

	// The out-of-scope draft is untouched: no narrative written, no new row.
	rb, err := repo.GetByID(context.Background(), "rb", testTenantID)
	if err != nil {
		t.Fatalf("GetByID(rb): %v", err)
	}
	if rb.AINarrativeDraft != "" {
		t.Errorf("out-of-scope rb draft = %q, want it untouched", rb.AINarrativeDraft)
	}
	repo.mu.Lock()
	total := len(repo.byID)
	repo.mu.Unlock()
	if total != 3 {
		t.Errorf("report rows = %d, want 3 (no new draft for the out-of-scope topic)", total)
	}
	// In-scope reports were generated as usual.
	for _, id := range []string{"ra", "rc"} {
		r, gerr := repo.GetByID(context.Background(), id, testTenantID)
		if gerr != nil {
			t.Fatalf("GetByID(%s): %v", id, gerr)
		}
		if r.AINarrativeDraft != "draft" {
			t.Errorf("narrative draft for %s = %q, want %q", id, r.AINarrativeDraft, "draft")
		}
	}
}

// newTopicHandlerFixture wires a handler whose session instantiates topicA and
// topicB, with a seeded (out-of-scope) topicB draft for participant p-a.
func newTopicHandlerFixture(t *testing.T, seed bool) (*handler.ReportHandler, *echo.Echo, *genRepo, *participantMissionFake, *blockingGen, *reports.Usecase) {
	t.Helper()
	repo := newGenRepo()
	if seed {
		seedTopicReport(repo, "rb", "p-a", topicB)
	}
	gen := newBlockingGen() // no blocks: in-scope narratives finish immediately
	sess := &genSessionRepo{
		participants: newParticipants(1),
		stages: []entity.SessionStage{
			{BaseModel: entity.BaseModel{ID: "ss-a"}, ProgramStageID: topicA},
			{BaseModel: entity.BaseModel{ID: "ss-b"}, ProgramStageID: topicB},
		},
	}
	bank := &missionBankFake{items: []entity.MissionBank{
		{BaseModel: entity.BaseModel{ID: "m-1"}, Title: "Misi Satu"},
	}}
	pm := newParticipantMissionFake()
	uc := newMissionUsecase(repo, gen, sess, bank, pm)
	cfg := &config.Config{ParentReportBaseURL: "http://localhost/parent/report", ReportTokenTTL: 168 * time.Hour}
	h := handler.NewReportHandler(uc, cfg, sess, sse.NewHub(), nil, nil, nil)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	return h, e, repo, pm, gen, uc
}

// TestGenerateHandlerTopicScoped: POST /api/reports/generate with topic_id
// generates ONLY that topic — the other topic's pre-existing draft stays
// untouched and gets no second draft row; a topic_id outside the session is
// rejected with 400 topic_not_in_session before anything starts; without
// topic_id every session topic is generated (back-compat).
func TestGenerateHandlerTopicScoped(t *testing.T) {
	t.Run("topic_id pins the run to one topic", func(t *testing.T) {
		h, e, repo, pm, gen, uc := newTopicHandlerFixture(t, true)
		body := `{"session_id":"` + genSessionID + `","topic_id":"` + topicA + `"}`
		if code, errCode := postGenerate(t, e, h, testTenantID, body); code != http.StatusAccepted || errCode != "" {
			t.Fatalf("generate = (%d, %q), want (202, \"\")", code, errCode)
		}

		// Exactly one narrative worker, for the topicA draft just created.
		started := waitStarted(t, gen, 1)
		wantID := "draft-p-a-" + topicA
		if started[0] != wantID {
			t.Fatalf("generated report = %q, want %q (topicA only)", started[0], wantID)
		}
		pollGenerate(t, uc, genSessionID, testTenantID,
			func(_ reports.GenerateStatus, ok bool) bool { return !ok }, "async run cleanup")

		// topicB's draft: untouched — no narrative, no second row, no missions.
		rb, err := repo.GetByID(context.Background(), "rb", testTenantID)
		if err != nil {
			t.Fatalf("GetByID(rb): %v", err)
		}
		if rb.AINarrativeDraft != "" {
			t.Errorf("out-of-scope topicB draft = %q, want it untouched", rb.AINarrativeDraft)
		}
		if n := rowsForStage(repo, "p-a", topicB); n != 1 {
			t.Errorf("topicB rows = %d, want 1 (no new draft for the other topic)", n)
		}
		if n := pm.persistedCount("rb"); n != 0 {
			t.Errorf("topicB report got %d mission persists, want 0", n)
		}
		// topicA's draft exists, was generated, and carries its missions.
		draft, err := repo.GetByID(context.Background(), wantID, testTenantID)
		if err != nil {
			t.Fatalf("GetByID(%s): %v", wantID, err)
		}
		if draft.ProgramStageID != topicA || draft.AINarrativeDraft != "draft" {
			t.Errorf("topicA draft = (stage %q, narrative %q), want (%q, %q)",
				draft.ProgramStageID, draft.AINarrativeDraft, topicA, "draft")
		}
		if n := pm.persistedCount(wantID); n != 1 {
			t.Errorf("topicA mission persists = %d, want 1", n)
		}
	})

	t.Run("topic_id outside the session is rejected", func(t *testing.T) {
		h, e, repo, _, gen, uc := newTopicHandlerFixture(t, true)
		body := `{"session_id":"` + genSessionID + `","topic_id":"` + topicNone + `"}`
		if code, errCode := postGenerate(t, e, h, testTenantID, body); code != http.StatusBadRequest || errCode != "topic_not_in_session" {
			t.Fatalf("generate = (%d, %q), want (400, topic_not_in_session)", code, errCode)
		}
		// Nothing started: no run, no workers, no new rows.
		if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
			t.Error("a rejected topic_id must not start a run")
		}
		if len(gen.started) != 0 {
			t.Errorf("a rejected topic_id must not spawn workers, got %v", gen.started)
		}
		repo.mu.Lock()
		total := len(repo.byID)
		repo.mu.Unlock()
		if total != 1 {
			t.Errorf("report rows = %d, want 1 (nothing created on rejection)", total)
		}
	})

	t.Run("without topic_id every session topic is generated", func(t *testing.T) {
		h, e, repo, pm, gen, uc := newTopicHandlerFixture(t, false)
		if code, errCode := postGenerate(t, e, h, testTenantID, `{"session_id":"`+genSessionID+`"}`); code != http.StatusAccepted || errCode != "" {
			t.Fatalf("generate = (%d, %q), want (202, \"\")", code, errCode)
		}
		started := waitStarted(t, gen, 2)
		want := []string{"draft-p-a-" + topicA, "draft-p-a-" + topicB}
		if !equalStrings(started, want) {
			t.Fatalf("started workers = %v, want %v (both session topics)", started, want)
		}
		pollGenerate(t, uc, genSessionID, testTenantID,
			func(_ reports.GenerateStatus, ok bool) bool { return !ok }, "async run cleanup")
		if rowsForStage(repo, "p-a", topicA) != 1 || rowsForStage(repo, "p-a", topicB) != 1 {
			t.Errorf("rows by topic = (A:%d, B:%d), want 1 each", rowsForStage(repo, "p-a", topicA), rowsForStage(repo, "p-a", topicB))
		}
		for _, id := range want {
			r, err := repo.GetByID(context.Background(), id, testTenantID)
			if err != nil {
				t.Fatalf("GetByID(%s): %v", id, err)
			}
			if r.AINarrativeDraft != "draft" {
				t.Errorf("narrative draft for %s = %q, want %q", id, r.AINarrativeDraft, "draft")
			}
			if n := pm.persistedCount(id); n != 1 {
				t.Errorf("mission persists for %s = %d, want 1", id, n)
			}
		}
	})
}

// TestGenerateRejectsMalformedTopicID: topic_id that is not a UUID fails
// request validation (400 validation_error) before any run starts.
func TestGenerateRejectsMalformedTopicID(t *testing.T) {
	h, e, repo, _, gen, uc := newTopicHandlerFixture(t, true)
	body := `{"session_id":"` + genSessionID + `","topic_id":"not-a-uuid"}`
	code, errCode := postGenerate(t, e, h, testTenantID, body)
	if code != http.StatusBadRequest || errCode != "validation_error" {
		t.Fatalf("generate = (%d, %q), want (400, validation_error)", code, errCode)
	}
	if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
		t.Error("a malformed topic_id must not start a run")
	}
	if len(gen.started) != 0 {
		t.Errorf("a malformed topic_id must not spawn workers, got %v", gen.started)
	}
	repo.mu.Lock()
	total := len(repo.byID)
	repo.mu.Unlock()
	if total != 1 {
		t.Errorf("report rows = %d, want 1 (nothing created on rejection)", total)
	}
}
