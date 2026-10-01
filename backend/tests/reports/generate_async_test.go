package reports_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/usecase/reports"
)

// postGenerate issues POST /api/reports/generate and returns the HTTP status
// plus the envelope's error code ("" when the response carries no error).
func postGenerate(t *testing.T, e *echo.Echo, h *handler.ReportHandler, tenantID, body string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/reports/generate", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, tenantID)
	if err := h.GenerateForSession(c); err != nil {
		t.Fatalf("generate POST returned handler error: %v", err)
	}
	errCode := ""
	if rec.Code >= 400 {
		var env struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		if jerr := json.Unmarshal(rec.Body.Bytes(), &env); jerr == nil {
			errCode = env.Error.Code
		}
	}
	return rec.Code, errCode
}

// findItem returns the registry item for a report id (nil when absent).
func findItem(st reports.GenerateStatus, reportID string) *reports.GenerateItem {
	for i := range st.Items {
		if st.Items[i].ReportID == reportID {
			return &st.Items[i]
		}
	}
	return nil
}

// TestGeneratePostAsyncAndConflict: POST /api/reports/generate answers 202
// promptly while the run is still executing (detached worker), exposes
// active_generate from the moment the 202 returns, 409s a concurrent POST
// while the run is active, and releases the guard once the run ends.
func TestGeneratePostAsyncAndConflict(t *testing.T) {
	repo := newGenRepo("p-a", "p-b")
	gen := newBlockingGen("r-p-a", "r-p-b")
	sess := &genSessionRepo{participants: newParticipants(2)}
	h, e := newDeliveryHandlerFixture(repo, gen, sess, nil)
	body := `{"session_id":"` + genSessionID + `"}`

	// Fast response: both narrative workers stay blocked, yet the POST must
	// return 202 — if the handler regresses to blocking, this times out.
	type postResult struct {
		err  error
		code int
	}
	done := make(chan postResult, 1)
	go func() {
		req := httptest.NewRequest(http.MethodPost, "/api/reports/generate", strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.Set(appmiddleware.CtxTenantID, testTenantID)
		done <- postResult{err: h.GenerateForSession(c), code: rec.Code}
	}()
	select {
	case res := <-done:
		if res.err != nil {
			t.Fatalf("generate POST returned error: %v", res.err)
		}
		if res.code != http.StatusAccepted {
			t.Fatalf("generate POST status = %d, want 202", res.code)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("generate POST must return 202 without waiting for the blocked workers")
	}

	// The run is observable immediately after the 202 (registry pre-registered
	// before the response, filled with the worklist as the worker begins).
	data := listGET(t, h, e, testTenantID, genSessionID)
	if _, ok := data["active_generate"]; !ok {
		t.Fatalf("active_generate must be live right after the 202, keys=%v", keysOf(data))
	}
	waitStarted(t, gen, 2)

	// A concurrent POST while the run is active → 409 already_generating.
	if code, errCode := postGenerate(t, e, h, testTenantID, body); code != http.StatusConflict || errCode != "already_generating" {
		t.Fatalf("concurrent generate = (%d, %q), want (409, already_generating)", code, errCode)
	}

	// Release the run: the worker finishes, registry and guard drop, and a
	// fresh POST is accepted again (202).
	close(gen.blocks["r-p-a"])
	close(gen.blocks["r-p-b"])
	deadline := time.Now().Add(3 * time.Second)
	for {
		code, errCode := postGenerate(t, e, h, testTenantID, body)
		if code == http.StatusAccepted {
			break
		}
		if code != http.StatusConflict || errCode != "already_generating" {
			t.Fatalf("post-run generate = (%d, %q), want (202, \"\") or (409, already_generating)", code, errCode)
		}
		if time.Now().After(deadline) {
			t.Fatal("genMu guard must release after the run ends")
		}
		time.Sleep(5 * time.Millisecond)
	}

	// The probe run has an empty worklist (drafts already persisted) and ends
	// immediately → the envelope disappears for good.
	deadline = time.Now().Add(3 * time.Second)
	for {
		data := listGET(t, h, e, testTenantID, genSessionID)
		if _, ok := data["active_generate"]; !ok {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("active_generate must vanish once every run has ended")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// TestGenerateRegistryPerItemLifecycle: every worklist report carries its own
// lifecycle in the registry — queued → processing (phase narrative) → success
// on persist, or error with phase + message on failure — the aggregates and
// the Failed map reflect the per-item states, and end() still cleans the run.
func TestGenerateRegistryPerItemLifecycle(t *testing.T) {
	repo := newGenRepo("p-a", "p-b", "p-c")
	markTopicScoped(repo, "stage1")
	gen := newBlockingGen("r-p-b", "r-p-c")
	gen.failIDs = map[string]bool{"r-p-a": true} // r-p-a's narrative fails fast
	sess := &genSessionRepo{participants: newParticipants(3)}
	bank := &missionBankFake{items: []entity.MissionBank{
		{BaseModel: entity.BaseModel{ID: "m-1"}, Title: "Misi Satu"},
	}}
	pm := newParticipantMissionFake()
	uc := newMissionUsecase(repo, gen, sess, bank, pm)

	done := make(chan error, 1)
	go func() {
		_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, newParticipants(3), nil)
		done <- err
	}()
	waitStarted(t, gen, 3)

	// r-p-a: narrative failure recorded per item with phase + message.
	st := pollGenerate(t, uc, genSessionID, testTenantID, func(st reports.GenerateStatus, ok bool) bool {
		if !ok {
			return false
		}
		it := findItem(st, "r-p-a")
		return it != nil && it.Status == reports.GenerateItemError
	}, "narrative failure recorded for r-p-a")
	itA := findItem(st, "r-p-a")
	if itA.Phase != reports.GeneratePhaseNarrative {
		t.Errorf("r-p-a phase = %q, want narrative", itA.Phase)
	}
	if !strings.Contains(itA.Error, "generation boom") {
		t.Errorf("r-p-a error = %q, want it to contain generation boom", itA.Error)
	}
	if !strings.Contains(st.Failed["r-p-a"], "generation boom") {
		t.Errorf("Failed[r-p-a] = %q, want it to contain generation boom", st.Failed["r-p-a"])
	}

	// r-p-b: processing with phase narrative while its worker runs; r-p-c
	// stays blocked so the run (and its item states) remain observable.
	st = pollGenerate(t, uc, genSessionID, testTenantID, func(st reports.GenerateStatus, ok bool) bool {
		if !ok {
			return false
		}
		it := findItem(st, "r-p-b")
		return it != nil && it.Status == reports.GenerateItemProcessing && it.Phase == reports.GeneratePhaseNarrative
	}, "r-p-b processing phase=narrative")
	if st.Total != 3 {
		t.Errorf("total = %d, want 3", st.Total)
	}

	// Release r-p-b → draft persisted, missions persisted → item success;
	// r-p-c keeps the run alive so the success state is observable.
	close(gen.blocks["r-p-b"])
	st = pollGenerate(t, uc, genSessionID, testTenantID, func(st reports.GenerateStatus, ok bool) bool {
		if !ok {
			return false
		}
		it := findItem(st, "r-p-b")
		return it != nil && it.Status == reports.GenerateItemSuccess
	}, "r-p-b success after draft persist")
	if st.Succeeded != 1 || st.ErrorCount != 1 || st.Processing != 1 || st.Queued != 0 {
		t.Errorf("aggregates succeeded/error/processing/queued = %d/%d/%d/%d, want 1/1/1/0",
			st.Succeeded, st.ErrorCount, st.Processing, st.Queued)
	}
	if msg := st.Failed["r-p-a"]; msg == "" {
		t.Error("Failed map must carry r-p-a's message while the run is live")
	}
	if msg := st.Failed["r-p-b"]; msg != "" {
		t.Errorf("Failed[r-p-b] = %q, want empty (r-p-b succeeded)", msg)
	}

	// Existing aggregate behavior unchanged: the run still returns the
	// narrative_generation_failed aggregate error, then end() cleans up.
	close(gen.blocks["r-p-c"])
	if err := <-done; err == nil {
		t.Fatal("run with a narrative failure must return an error")
	} else {
		requireAppErrorCode(t, err, "narrative_generation_failed")
	}
	if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
		t.Fatal("registry must be empty after the run")
	}
}
