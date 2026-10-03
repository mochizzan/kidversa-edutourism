package reports_test

import (
	"context"
	"encoding/json"
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

// TestGenerateNarrativeSkippedWithoutAssessments: a report whose participant
// has NO assessments for its Topic skips the narrative phase explicitly
// (narrative_skip_reason=no_assessments, the generator is never called, no
// draft is written) while the mission phase still runs and persists — a
// partial skip derives status=success with the reason attached and records no
// failure.
func TestGenerateNarrativeSkippedWithoutAssessments(t *testing.T) {
	repo := newGenRepo("p-a", "p-b")
	markTopicScoped(repo, "stage1")
	gen := newBlockingGen("r-p-a", "r-p-b") // r-p-a's block is never consumed (skipped)
	sess := &genSessionRepo{participants: newParticipants(2)}
	bank := &missionBankFake{items: []entity.MissionBank{
		{BaseModel: entity.BaseModel{ID: "m-1"}, Title: "Misi Satu"},
	}}
	pm := newParticipantMissionFake()
	uc := newMissionUsecaseWithAssess(repo, gen, sess, bank, pm,
		&assessmentListFake{noFor: map[string]bool{"p-a": true}})

	done := make(chan error, 1)
	go func() {
		_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, newParticipants(2), nil)
		done <- err
	}()

	// Only r-p-b ever reaches the generator — r-p-a's narrative was skipped.
	started := waitStarted(t, gen, 1)
	if started[0] != "r-p-b" {
		t.Fatalf("started workers = %v, want only [r-p-b] (r-p-a must be skipped before the generator)", started)
	}

	// The mission phase is unaffected by the narrative gate.
	waitMissionPersist(t, pm, "r-p-a", "r-p-b")

	// r-p-a: partial skip → success with the narrative reason; no failure.
	st := pollGenerate(t, uc, genSessionID, testTenantID,
		func(st reports.GenerateStatus, ok bool) bool {
			if !ok {
				return false
			}
			it := findItem(st, "r-p-a")
			return it != nil && it.Status == reports.GenerateItemSuccess &&
				it.NarrativeSkipReason == reports.SkipReasonNoAssessments
		}, "r-p-a partial skip (narrative)")
	itA := findItem(st, "r-p-a")
	if itA.MissionSkipReason != "" {
		t.Errorf("mission_skip_reason = %q, want empty (missions were generated)", itA.MissionSkipReason)
	}
	if itA.Error != "" || st.Failed["r-p-a"] != "" {
		t.Errorf("a skipped narrative must not be a failure, error=%q Failed=%q", itA.Error, st.Failed["r-p-a"])
	}
	if st.ErrorCount != 0 {
		t.Errorf("error count = %d, want 0", st.ErrorCount)
	}

	close(gen.blocks["r-p-b"])
	if err := <-done; err != nil {
		t.Fatalf("a skipped narrative must not fail the run: %v", err)
	}

	// The generator was never called for r-p-a and its draft was never written;
	// r-p-b generated normally; missions persisted for BOTH (gate is narrative-only).
	select {
	case id := <-gen.started:
		t.Errorf("generator called for %q after the run, want none (r-p-a skipped)", id)
	default:
	}
	for _, id := range []string{"r-p-a", "r-p-b"} {
		r, gerr := repo.GetByID(context.Background(), id, testTenantID)
		if gerr != nil {
			t.Fatalf("GetByID(%s): %v", id, gerr)
		}
		if id == "r-p-a" && r.AINarrativeDraft != "" {
			t.Errorf("skipped r-p-a draft = %q, want empty", r.AINarrativeDraft)
		}
		if id == "r-p-b" && r.AINarrativeDraft != "draft" {
			t.Errorf("r-p-b draft = %q, want %q", r.AINarrativeDraft, "draft")
		}
		if n := pm.persistedCount(id); n != 1 {
			t.Errorf("mission persists for %s = %d, want 1", id, n)
		}
	}
}

// TestGenerateBothPhasesSkippedEnvelopeContract: when BOTH phases skip (empty
// mission bank + no assessments) the item derives status=skipped with both
// machine reasons — and the locked active_generate JSON contract carries them
// through GET /api/reports: status "skipped", mission_skip_reason,
// narrative_skip_reason present; no error/phase keys; skips never counted as
// failures in the aggregates.
func TestGenerateBothPhasesSkippedEnvelopeContract(t *testing.T) {
	repo := newGenRepo("p-a", "p-b")
	markTopicScoped(repo, "stage1")
	gen := newBlockingGen("r-p-b") // r-p-a: both phases skipped; r-p-b keeps the run alive
	sess := &genSessionRepo{participants: newParticipants(2)}
	pm := newParticipantMissionFake()
	uc := newMissionUsecaseWithAssess(repo, gen, sess, &missionBankFake{} /* empty bank */, pm,
		&assessmentListFake{noFor: map[string]bool{"p-a": true}})
	cfg := &config.Config{ParentReportBaseURL: "http://localhost/parent/report", ReportTokenTTL: 168 * time.Hour}
	h := handler.NewReportHandler(uc, cfg, sess, sse.NewHub(), nil, nil, nil)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()

	if code, errCode := postGenerate(t, e, h, testTenantID, `{"session_id":"`+genSessionID+`"}`); code != 202 || errCode != "" {
		t.Fatalf("generate = (%d, %q), want (202, \"\")", code, errCode)
	}
	// Only r-p-b's narrative starts; r-p-a never reaches the generator.
	started := waitStarted(t, gen, 1)
	if started[0] != "r-p-b" {
		t.Fatalf("started workers = %v, want only [r-p-b]", started)
	}

	// Wait until both items reach their terminal skip states.
	st := pollGenerate(t, uc, genSessionID, testTenantID,
		func(st reports.GenerateStatus, ok bool) bool {
			if !ok {
				return false
			}
			a, b := findItem(st, "r-p-a"), findItem(st, "r-p-b")
			return a != nil && a.Status == reports.GenerateItemSkipped &&
				a.MissionSkipReason == reports.SkipReasonMissionBankEmpty &&
				a.NarrativeSkipReason == reports.SkipReasonNoAssessments &&
				b != nil && b.MissionSkipReason == reports.SkipReasonMissionBankEmpty
		}, "r-p-a fully skipped + r-p-b mission skip")
	if len(st.Failed) != 0 || st.ErrorCount != 0 {
		t.Errorf("skips must not be failures: Failed=%v ErrorCount=%d", st.Failed, st.ErrorCount)
	}
	if st.Total != 2 {
		t.Errorf("total = %d, want 2", st.Total)
	}

	// The JSON envelope (registry → NewReportActiveGenerate → ListReports).
	data := listGET(t, h, e, testTenantID, genSessionID)
	raw, ok := data["active_generate"]
	if !ok {
		t.Fatalf("active_generate must be live during the run, keys=%v", keysOf(data))
	}
	var ag map[string]json.RawMessage
	if err := json.Unmarshal(raw, &ag); err != nil {
		t.Fatalf("invalid active_generate: %v", err)
	}
	var items []map[string]json.RawMessage
	if err := json.Unmarshal(ag["items"], &items); err != nil {
		t.Fatalf("invalid items: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("items len = %d, want 2", len(items))
	}
	byID := map[string]map[string]json.RawMessage{}
	for _, it := range items {
		byID[jsonString(t, it["report_id"])] = it
	}

	// Locked contract: a fully skipped item = status + both reasons ONLY.
	skipped := byID["r-p-a"]
	if skipped == nil {
		t.Fatal("missing item for r-p-a")
	}
	requireExactKeys(t, skipped, "report_id", "status", "mission_skip_reason", "narrative_skip_reason")
	if got := jsonString(t, skipped["status"]); got != "skipped" {
		t.Errorf("r-p-a status = %q, want \"skipped\"", got)
	}
	if got := jsonString(t, skipped["mission_skip_reason"]); got != reports.SkipReasonMissionBankEmpty {
		t.Errorf("r-p-a mission_skip_reason = %q, want %q", got, reports.SkipReasonMissionBankEmpty)
	}
	if got := jsonString(t, skipped["narrative_skip_reason"]); got != reports.SkipReasonNoAssessments {
		t.Errorf("r-p-a narrative_skip_reason = %q, want %q", got, reports.SkipReasonNoAssessments)
	}

	// Partial skip on r-p-b: still running its narrative, mission reason
	// present, no error/narrative reason keys.
	partial := byID["r-p-b"]
	if partial == nil {
		t.Fatal("missing item for r-p-b")
	}
	requireExactKeys(t, partial, "report_id", "status", "phase", "mission_skip_reason")
	if got := jsonString(t, partial["mission_skip_reason"]); got != reports.SkipReasonMissionBankEmpty {
		t.Errorf("r-p-b mission_skip_reason = %q, want %q", got, reports.SkipReasonMissionBankEmpty)
	}
	stB, phB := jsonString(t, partial["status"]), jsonString(t, partial["phase"])
	if stB != "processing" || phB != "narrative" {
		t.Errorf("r-p-b = (%s, %s), want (processing, narrative)", stB, phB)
	}

	if got := jsonFloat(t, ag["failed"]); got != 0 {
		t.Errorf("failed aggregate = %v, want 0 (skips are not failures)", got)
	}
	if got := jsonFloat(t, ag["total"]); got != 2 {
		t.Errorf("total aggregate = %v, want 2", got)
	}

	// Finish: the run completes cleanly and no narrative/missions exist for
	// the fully skipped report.
	close(gen.blocks["r-p-b"])
	deadline := time.Now().Add(3 * time.Second)
	for {
		dataAfter := listGET(t, h, e, testTenantID, genSessionID)
		if _, live := dataAfter["active_generate"]; !live {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("active_generate must vanish after the run completes")
		}
		time.Sleep(5 * time.Millisecond)
	}

	for _, id := range []string{"r-p-a", "r-p-b"} {
		if n := pm.persistedCount(id); n != 0 {
			t.Errorf("mission persists for %s = %d, want 0 (bank empty)", id, n)
		}
	}
	rA, err := repo.GetByID(context.Background(), "r-p-a", testTenantID)
	if err != nil {
		t.Fatalf("GetByID(r-p-a): %v", err)
	}
	if rA.AINarrativeDraft != "" {
		t.Errorf("fully skipped r-p-a draft = %q, want empty", rA.AINarrativeDraft)
	}
	rB, err := repo.GetByID(context.Background(), "r-p-b", testTenantID)
	if err != nil {
		t.Fatalf("GetByID(r-p-b): %v", err)
	}
	if rB.AINarrativeDraft != "draft" {
		t.Errorf("r-p-b draft = %q, want %q (narrative-only result)", rB.AINarrativeDraft, "draft")
	}
}
