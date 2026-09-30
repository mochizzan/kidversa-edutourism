package reports_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// newSendContext builds a POST /api/reports/:id/send echo context (no testing
// deps → safe to call from goroutines).
func newSendContext(e *echo.Echo, tenantID, reportID, body string) (*echo.Context, *httptest.ResponseRecorder) {
	req := httptest.NewRequest(http.MethodPost, "/api/reports/"+reportID+"/send", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: reportID}})
	c.Set(appmiddleware.CtxTenantID, tenantID)
	return c, rec
}

func requireSendInProgress(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected a send_in_progress error, got nil")
	}
	status, code, ok := apperrors.AsAppError(err)
	if !ok {
		t.Fatalf("expected AppError, got %v", err)
	}
	if code != "send_in_progress" {
		t.Fatalf("code = %q, want send_in_progress (err=%v)", code, err)
	}
	if status != http.StatusConflict {
		t.Fatalf("status = %d, want 409", status)
	}
}

// TestSendInProgressMessageMapped: the 409 code must resolve to a stable,
// non-fallback Indonesian message (never the default "Terjadi kesalahan").
func TestSendInProgressMessageMapped(t *testing.T) {
	got := appresp.MessageForCode("send_in_progress")
	fallback := appresp.MessageForCode("__unknown_delivery_code__")
	if got == "" || got == fallback {
		t.Fatalf("send_in_progress must have a dedicated message, got %q", got)
	}
}

// TestSendInProgressResponseEnvelope: the handler's 409 must reach the client
// as the standard error envelope carrying code send_in_progress with the
// mapped Indonesian message (never an unmapped/default code).
func TestSendInProgressResponseEnvelope(t *testing.T) {
	repo := newGenRepo()
	repo.addReport(sendReport1, "p-a")
	gen := newBlockingGen()
	sess := &genSessionRepo{participants: newParticipants(1)}
	msg := &gateMessenger{started: make(chan struct{}, 8), release: make(chan struct{})}
	h, e := newDeliveryHandlerFixture(repo, gen, sess, msg)

	// First attempt in flight (gateway blocked) with a declared queue.
	done := make(chan error, 1)
	go func() {
		c, _ := newSendContext(e, testTenantID, sendReport1, `{"queue":["`+sendReport1+`"]}`)
		done <- h.Send(c)
	}()
	select {
	case <-msg.started:
	case <-time.After(3 * time.Second):
		t.Fatal("first send never reached the gateway")
	}

	// Concurrent attempt → 409 AppError → serialized by the real error handler.
	c2, rec2 := newSendContext(e, testTenantID, sendReport1, `{"queue":["`+sendReport1+`"]}`)
	conflictErr := h.Send(c2)
	requireSendInProgress(t, conflictErr)
	appmiddleware.ErrorHandler(c2, conflictErr)
	if rec2.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec2.Code)
	}
	var env struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec2.Body.Bytes(), &env); err != nil {
		t.Fatalf("invalid 409 body %q: %v", rec2.Body.String(), err)
	}
	if env.Error.Code != "send_in_progress" {
		t.Fatalf("envelope code = %q, want send_in_progress", env.Error.Code)
	}
	if want := appresp.MessageForCode("send_in_progress"); env.Error.Message != want {
		t.Fatalf("envelope message = %q, want mapped %q", env.Error.Message, want)
	}

	close(msg.release)
	if err := <-done; err != nil {
		t.Fatalf("first send returned error: %v", err)
	}
}

// TestReportSendQueueLifecycle covers declare → sending → completion removes →
// auto-close, plus tenant isolation, on the queue itself.
func TestReportSendQueueLifecycle(t *testing.T) {
	q := handler.NewReportSendQueue()
	if q.TTL != handler.ReportSendRunTTL {
		t.Fatalf("default TTL = %v, want %v", q.TTL, handler.ReportSendRunTTL)
	}

	// Declare the run: queued = declared set, target in sending.
	if err := q.Begin(testTenantID, genSessionID, sendReport1, []string{sendReport1, sendReport2}); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	snap := q.ActiveSend(testTenantID, genSessionID)
	if snap == nil {
		t.Fatal("expected active_send snapshot after declare")
	}
	if snap.SessionID != genSessionID {
		t.Errorf("session_id = %q, want %q", snap.SessionID, genSessionID)
	}
	if _, err := time.Parse(time.RFC3339, snap.UpdatedAt); err != nil {
		t.Errorf("updated_at is not RFC3339: %v", err)
	}
	if !equalStrings(snap.QueuedIDs, []string{sendReport1, sendReport2}) {
		t.Errorf("queued = %v", snap.QueuedIDs)
	}
	if !equalStrings(snap.SendingIDs, []string{sendReport1}) {
		t.Errorf("sending = %v", snap.SendingIDs)
	}

	// In-flight guard: same target again → 409 send_in_progress.
	requireSendInProgress(t, q.Begin(testTenantID, genSessionID, sendReport1, []string{sendReport1}))

	// Tenant isolation: another tenant reads nothing; and the guard sees the
	// target in flight in ANY run (design: cross-run in-flight guard).
	if q.ActiveSend("tenant-other", genSessionID) != nil {
		t.Error("another tenant must not observe the run")
	}
	requireSendInProgress(t, q.Begin("tenant-other", genSessionID, sendReport1, []string{sendReport1}))

	// Completion removes the target from queued+sending; the run survives
	// while unsent rows remain declared.
	q.Finish(testTenantID, genSessionID, sendReport1)
	snap = q.ActiveSend(testTenantID, genSessionID)
	if snap == nil {
		t.Fatal("run must survive while report2 is still queued")
	}
	if !equalStrings(snap.QueuedIDs, []string{sendReport2}) || len(snap.SendingIDs) != 0 {
		t.Fatalf("after finish: queued=%v sending=%v, want queued=[%s] sending=[]", snap.QueuedIDs, snap.SendingIDs, sendReport2)
	}

	// Last attempt: declare the remainder, send it, finish → auto-close.
	if err := q.Begin(testTenantID, genSessionID, sendReport2, []string{sendReport2}); err != nil {
		t.Fatalf("Begin second target: %v", err)
	}
	q.Finish(testTenantID, genSessionID, sendReport2)
	if q.ActiveSend(testTenantID, genSessionID) != nil {
		t.Fatal("run must auto-delete when nothing is queued or in flight")
	}
}

// TestReportSendQueueTTLEviction: a run with no update for TTL is evicted
// lazily on read/write; the in-flight guard then clears with it.
func TestReportSendQueueTTLEviction(t *testing.T) {
	q := handler.NewReportSendQueue()
	q.TTL = 40 * time.Millisecond

	if err := q.Begin(testTenantID, genSessionID, sendReport1, []string{sendReport1}); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	requireSendInProgress(t, q.Begin(testTenantID, genSessionID, sendReport1, []string{sendReport1}))

	time.Sleep(120 * time.Millisecond)

	if snap := q.ActiveSend(testTenantID, genSessionID); snap != nil {
		t.Fatalf("stale run must be TTL-evicted on read, got %+v", snap)
	}
	if err := q.Begin(testTenantID, genSessionID, sendReport1, []string{sendReport1}); err != nil {
		t.Fatalf("guard must clear after TTL eviction, got %v", err)
	}
}

// TestSendQueueHandlerLifecycle drives POST /api/reports/:id/send with a
// declared queue end to end: in-flight 409, active_send envelope with the
// exact contract keys, completion removes the target, and the run auto-closes
// after the last declared report is sent.
func TestSendQueueHandlerLifecycle(t *testing.T) {
	repo := newGenRepo()
	repo.addReport(sendReport1, "p-a")
	repo.addReport(sendReport2, "p-a")
	gen := newBlockingGen()
	sess := &genSessionRepo{participants: newParticipants(1)}
	msg := &gateMessenger{started: make(chan struct{}, 8), release: make(chan struct{})}
	h, e := newDeliveryHandlerFixture(repo, gen, sess, msg)
	queueBody := `{"queue":["` + sendReport1 + `","` + sendReport2 + `"]}`

	// First attempt goes in flight (gateway blocked) with the full declaration.
	done := make(chan error, 1)
	go func() {
		c, _ := newSendContext(e, testTenantID, sendReport1, queueBody)
		done <- h.Send(c)
	}()
	select {
	case <-msg.started:
	case <-time.After(3 * time.Second):
		t.Fatal("first send never reached the gateway")
	}

	// Concurrent attempt for the same target → 409 send_in_progress.
	c2, _ := newSendContext(e, testTenantID, sendReport1, queueBody)
	requireSendInProgress(t, h.Send(c2))

	// active_send with the exact contract keys while in flight.
	data := listGET(t, h, e, testTenantID, genSessionID)
	if _, ok := data["active_send"]; !ok {
		t.Fatalf("expected active_send while a send is in flight, keys=%v", keysOf(data))
	}
	if _, ok := data["active_generate"]; ok {
		t.Fatal("active_generate must be absent when no generate runs")
	}
	var as map[string]json.RawMessage
	if err := json.Unmarshal(data["active_send"], &as); err != nil {
		t.Fatalf("invalid active_send: %v", err)
	}
	requireExactKeys(t, as, "session_id", "updated_at", "queued_ids", "sending_ids")
	if got := jsonString(t, as["session_id"]); got != genSessionID {
		t.Errorf("session_id = %q, want %q", got, genSessionID)
	}
	if _, err := time.Parse(time.RFC3339, jsonString(t, as["updated_at"])); err != nil {
		t.Errorf("updated_at is not RFC3339: %v", err)
	}
	if got := stringArray(t, as["queued_ids"]); !equalStrings(got, []string{sendReport1, sendReport2}) {
		t.Errorf("queued_ids = %v", got)
	}
	if got := stringArray(t, as["sending_ids"]); !equalStrings(got, []string{sendReport1}) {
		t.Errorf("sending_ids = %v", got)
	}

	// Restart semantics: a fresh handler instance has no run at all.
	h2, e2 := newDeliveryHandlerFixture(newGenRepo(), newBlockingGen(), sess, nil)
	dataFresh := listGET(t, h2, e2, testTenantID, genSessionID)
	if _, ok := dataFresh["active_send"]; ok {
		t.Error("fresh instance must omit active_send")
	}
	if _, ok := dataFresh["active_generate"]; ok {
		t.Error("fresh instance must omit active_generate")
	}

	// First attempt completes → target removed, run stays for the remainder.
	close(msg.release)
	if err := <-done; err != nil {
		t.Fatalf("first send returned error: %v", err)
	}
	data = listGET(t, h, e, testTenantID, genSessionID)
	rawAS, ok := data["active_send"]
	if !ok {
		t.Fatal("run must survive while report2 is still queued")
	}
	as = nil
	if err := json.Unmarshal(rawAS, &as); err != nil {
		t.Fatalf("invalid active_send: %v", err)
	}
	if got := stringArray(t, as["queued_ids"]); !equalStrings(got, []string{sendReport2}) {
		t.Errorf("queued_ids after completion = %v, want [%s]", got, sendReport2)
	}
	if got := stringArray(t, as["sending_ids"]); len(got) != 0 {
		t.Errorf("sending_ids after completion = %v, want []", got)
	}

	// Last declared report → auto-close: flag gone from the envelope.
	c3, rec3 := newSendContext(e, testTenantID, sendReport2, `{"queue":["`+sendReport2+`"]}`)
	if err := h.Send(c3); err != nil {
		t.Fatalf("second send returned error: %v", err)
	}
	if rec3.Code != http.StatusOK {
		t.Fatalf("second send status = %d, want 200: %s", rec3.Code, rec3.Body.String())
	}
	data = listGET(t, h, e, testTenantID, genSessionID)
	if _, ok := data["active_send"]; ok {
		t.Fatal("active_send must auto-close after the last queued report is sent")
	}
	requireExactKeys(t, data, "items")
}

// TestSendWithoutQueueLegacyUnchanged: no "queue" in the body → no run is
// tracked, no in-flight guard applies, no active_send ever appears; repeated
// sends keep working exactly as before.
func TestSendWithoutQueueLegacyUnchanged(t *testing.T) {
	repo := newGenRepo()
	repo.addReport(sendReport1, "p-a")
	gen := newBlockingGen()
	sess := &genSessionRepo{participants: newParticipants(1)}
	msg := &gateMessenger{started: make(chan struct{}, 8), release: make(chan struct{})}
	close(msg.release) // legacy sends pass the gateway immediately
	h, e := newDeliveryHandlerFixture(repo, gen, sess, msg)

	for attempt := range 2 {
		c, rec := newSendContext(e, testTenantID, sendReport1, `{}`)
		if err := h.Send(c); err != nil {
			t.Fatalf("legacy send #%d returned error: %v", attempt+1, err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("legacy send #%d status = %d: %s", attempt+1, rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "parent_access_token") {
			t.Fatalf("legacy send #%d must return the token payload, got %s", attempt+1, rec.Body.String())
		}
	}

	data := listGET(t, h, e, testTenantID, genSessionID)
	if _, ok := data["active_send"]; ok {
		t.Fatal("legacy sends must not create a send run")
	}
	requireExactKeys(t, data, "items")
}
