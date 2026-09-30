package consent_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

const (
	consentTenantA   = "tenant-a"
	consentTenantB   = "tenant-b"
	consentSessionID = "session-1"
	consentBatchPath = "/api/consent/send-whatsapp"
)

// fakeConsentRepo supplies ListConsentFlat rows and records the audit-trail
// SendConsentRequest calls; other interface methods panic if touched.
type fakeConsentRepo struct {
	repository.ConsentRepository
	rows         []repository.ConsentFlatRow
	sendRequests atomic.Int32
}

func (f *fakeConsentRepo) ListConsentFlat(ctx context.Context, tenantID string) ([]repository.ConsentFlatRow, error) {
	return f.rows, nil
}

func (f *fakeConsentRepo) GetConsentValue(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) (bool, error) {
	return false, nil // never consented → always eligible
}

func (f *fakeConsentRepo) SendConsentRequest(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) error {
	f.sendRequests.Add(1)
	return nil
}

// fakeConsentSessionRepo provides the session/participant lookups SendWhatsApp
// needs; other methods panic if touched.
type fakeConsentSessionRepo struct {
	repository.SessionRepository
	session      *entity.Session
	participants []entity.Participant
}

func (f *fakeConsentSessionRepo) GetSessionByID(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	return f.session, nil
}

func (f *fakeConsentSessionRepo) ListParticipants(ctx context.Context, sessionID, groupID, tenantID string) ([]entity.Participant, error) {
	return f.participants, nil
}

func (f *fakeConsentSessionRepo) UpdateParticipantTokenIfAvailable(ctx context.Context, participantID, token string, expiresAt interface{}) (bool, error) {
	return true, nil
}

// blockMessenger blocks each gateway send until release is closed and counts
// the attempts (atomic: called from the batch goroutine, read by the test).
type blockMessenger struct {
	started chan struct{}
	release chan struct{}
	err     error
}

func (m *blockMessenger) SendTextMessage(ctx context.Context, chatID, text string) error {
	select {
	case m.started <- struct{}{}:
	default:
	}
	<-m.release
	return m.err
}

func newConsentFixture(repo *fakeConsentRepo, sess *fakeConsentSessionRepo, msg repository.MessagingService) (*handler.ConsentHandler, *echo.Echo) {
	cfg := &config.Config{ConsentTokenTTL: time.Hour, ParentConsentBaseURL: "http://localhost/parent/consent"}
	h := handler.NewConsentHandler(repo, sess, msg, cfg, sse.NewHub())
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	return h, e
}

func newConsentParticipant(id string) entity.Participant {
	sid := consentSessionID
	return entity.Participant{
		BaseModel:   entity.BaseModel{ID: id},
		ChildName:   "Anak " + id,
		ParentName:  "Ortu " + id,
		ParentPhone: "+62 812-3456-7890",
		SessionID:   &sid,
	}
}

// sendWhatsAppPOST performs the 202-returning batch trigger and returns the
// decoded data payload.
func sendWhatsAppPOST(t *testing.T, h *handler.ConsentHandler, e *echo.Echo, tenantID string) map[string]interface{} {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, consentBatchPath,
		strings.NewReader(`{"session_id":"`+consentSessionID+`"}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, tenantID)
	if err := h.SendWhatsApp(c); err != nil {
		t.Fatalf("SendWhatsApp returned error: %v", err)
	}
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("invalid 202 body %q: %v", rec.Body.String(), err)
	}
	return env.Data
}

// flatGET decodes the raw `data` object of GET /api/consent/flat.
func flatGET(t *testing.T, h *handler.ConsentHandler, e *echo.Echo, tenantID string) map[string]json.RawMessage {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/consent/flat", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, tenantID)
	if err := h.Flat(c); err != nil {
		t.Fatalf("Flat returned error: %v", err)
	}
	var env map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("invalid flat body %q: %v", rec.Body.String(), err)
	}
	var data map[string]json.RawMessage
	if err := json.Unmarshal(env["data"], &data); err != nil {
		t.Fatalf("invalid flat data %q: %v", string(env["data"]), err)
	}
	return data
}

func pollStatus(t *testing.T, h *handler.ConsentHandler, participantID string, want string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if h.BatchRegistry().Overlay(consentTenantA)[participantID] == want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("participant %s never reached %q, overlay = %v", participantID, want, h.BatchRegistry().Overlay(consentTenantA))
}

// TestConsentBatchLifecycle drives the real SendWhatsApp → processWhatsAppBatch
// flow: the batch is registered queued before the 202, marked processing while
// the gateway send is in flight, and lands on sent with the audit trail kept.
func TestConsentBatchLifecycle(t *testing.T) {
	repo := &fakeConsentRepo{}
	sess := &fakeConsentSessionRepo{
		session:      &entity.Session{Name: "Sains", SessionDate: "2026-07-15", Location: "Jakarta"},
		participants: []entity.Participant{newConsentParticipant("p1")},
	}
	msg := &blockMessenger{started: make(chan struct{}, 1), release: make(chan struct{})}
	h, e := newConsentFixture(repo, sess, msg)

	data := sendWhatsAppPOST(t, h, e, consentTenantA)
	batchID, _ := data["batch_id"].(string)
	if batchID == "" {
		t.Fatalf("202 payload missing batch_id: %v", data)
	}

	// Registered synchronously before the 202: everything is queued/processing
	// even before the worker finishes.
	overlay := h.BatchRegistry().Overlay(consentTenantA)
	if overlay["p1"] != handler.ConsentStatusQueued && overlay["p1"] != handler.ConsentStatusProcessing {
		t.Fatalf("expected queued/processing right after 202, got %q", overlay["p1"])
	}

	// The gateway send is now blocked → row must be "processing".
	select {
	case <-msg.started:
	case <-time.After(3 * time.Second):
		t.Fatal("gateway send never started")
	}
	if got := h.BatchRegistry().Overlay(consentTenantA)["p1"]; got != handler.ConsentStatusProcessing {
		t.Fatalf("expected processing while gateway send in flight, got %q", got)
	}
	batches := h.BatchRegistry().ActiveBatches(consentTenantA)
	if len(batches) != 1 || batches[0].Sent != 0 || batches[0].Failed != 0 {
		t.Fatalf("unexpected active batches mid-flight: %+v", batches)
	}

	close(msg.release)
	pollStatus(t, h, "p1", handler.ConsentStatusSent)

	if repo.sendRequests.Load() != 1 {
		t.Fatalf("expected SendConsentRequest audit trail call, got %d", repo.sendRequests.Load())
	}
	batches = h.BatchRegistry().ActiveBatches(consentTenantA)
	if len(batches) != 1 {
		t.Fatalf("expected 1 retained batch, got %d", len(batches))
	}
	b := batches[0]
	if b.BatchID != batchID || b.SessionID != consentSessionID || b.Total != 1 || b.Sent != 1 || b.Failed != 0 {
		t.Fatalf("unexpected batch snapshot: %+v", b)
	}
	if b.StartedAt == "" {
		t.Fatal("started_at must be set (RFC3339)")
	}
	if _, err := time.Parse(time.RFC3339, b.StartedAt); err != nil {
		t.Fatalf("started_at %q is not RFC3339: %v", b.StartedAt, err)
	}
}

// TestConsentBatchLifecycleFailed: a gateway failure marks the row failed and
// stores the error detail, without the audit trail.
func TestConsentBatchLifecycleFailed(t *testing.T) {
	repo := &fakeConsentRepo{}
	sess := &fakeConsentSessionRepo{
		session:      &entity.Session{Name: "Sains"},
		participants: []entity.Participant{newConsentParticipant("p1")},
	}
	msg := &blockMessenger{started: make(chan struct{}, 1), release: make(chan struct{}), err: context.DeadlineExceeded}
	h, e := newConsentFixture(repo, sess, msg)

	data := sendWhatsAppPOST(t, h, e, consentTenantA)
	batchID, _ := data["batch_id"].(string)

	select {
	case <-msg.started:
	case <-time.After(3 * time.Second):
		t.Fatal("gateway send never started")
	}
	close(msg.release)
	pollStatus(t, h, "p1", handler.ConsentStatusFailed)

	if got := h.BatchRegistry().Err(batchID, "p1"); got != "Gagal mengirim WhatsApp" {
		t.Fatalf("stored error = %q, want gateway failure detail", got)
	}
	if repo.sendRequests.Load() != 0 {
		t.Fatalf("failed send must not record the audit trail, got %d calls", repo.sendRequests.Load())
	}
	if b := h.BatchRegistry().ActiveBatches(consentTenantA); len(b) != 1 || b[0].Failed != 1 || b[0].Sent != 0 {
		t.Fatalf("unexpected batch snapshot after failure: %+v", b)
	}
}

// TestConsentFlatOverlayAndActiveBatches: GET /api/consent/flat overlays
// delivery_status per participant and carries active_batches — but only for the
// caller's tenant (tenant-b sees neither field).
func TestConsentFlatOverlayAndActiveBatches(t *testing.T) {
	repo := &fakeConsentRepo{rows: []repository.ConsentFlatRow{
		{ParticipantID: "p1", ChildName: "Budi", SessionID: consentSessionID, ConsentStatus: "not_sent"},
		{ParticipantID: "p2", ChildName: "Sari", SessionID: consentSessionID, ConsentStatus: "pending"},
	}}
	sess := &fakeConsentSessionRepo{}
	h, e := newConsentFixture(repo, sess, &blockMessenger{started: make(chan struct{}, 1), release: make(chan struct{})})

	reg := h.BatchRegistry()
	reg.Register("batch-a", consentSessionID, consentTenantA, []string{"p1", "p2"})
	reg.Register("batch-b", consentSessionID, consentTenantB, []string{"p3"})
	reg.SetStatus("batch-a", "p1", handler.ConsentStatusSent, "")
	reg.SetStatus("batch-a", "p2", handler.ConsentStatusFailed, "boom")

	dataA := flatGET(t, h, e, consentTenantA)
	// Exact contract names.
	if _, ok := dataA["active_batches"]; !ok {
		t.Fatalf("tenant-a flat missing active_batches: keys=%v", keysOf(dataA))
	}
	var batches []map[string]json.RawMessage
	if err := json.Unmarshal(dataA["active_batches"], &batches); err != nil {
		t.Fatalf("invalid active_batches: %v", err)
	}
	if len(batches) != 1 {
		t.Fatalf("expected exactly tenant-a's batch, got %d", len(batches))
	}
	for _, want := range []string{"batch_id", "session_id", "started_at", "total", "sent", "failed"} {
		if _, ok := batches[0][want]; !ok {
			t.Errorf("active_batches entry missing %q", want)
		}
	}
	var items []map[string]json.RawMessage
	if err := json.Unmarshal(dataA["items"], &items); err != nil {
		t.Fatalf("invalid items: %v", err)
	}
	statusByParticipant := map[string]string{}
	for _, it := range items {
		pid, err := jsonString(it["participant_id"])
		if err != nil {
			t.Fatalf("invalid participant_id: %v", err)
		}
		ds, ok := it["delivery_status"]
		if !ok {
			t.Fatalf("item %s missing delivery_status", pid)
		}
		status, err := jsonString(ds)
		if err != nil {
			t.Fatalf("invalid delivery_status for %s: %v", pid, err)
		}
		statusByParticipant[pid] = status
	}
	if statusByParticipant["p1"] != handler.ConsentStatusSent || statusByParticipant["p2"] != handler.ConsentStatusFailed {
		t.Fatalf("unexpected overlay: %v", statusByParticipant)
	}

	// Tenant filtering: tenant-b's own batch only, tenant-a rows carry no overlay.
	dataB := flatGET(t, h, e, consentTenantB)
	var batchesB []map[string]json.RawMessage
	if err := json.Unmarshal(dataB["active_batches"], &batchesB); err != nil || len(batchesB) != 1 {
		t.Fatalf("tenant-b should see exactly its own batch, err=%v batches=%v", err, batchesB)
	}
	var itemsB []map[string]json.RawMessage
	if err := json.Unmarshal(dataB["items"], &itemsB); err != nil {
		t.Fatalf("invalid items: %v", err)
	}
	for _, it := range itemsB {
		if _, ok := it["delivery_status"]; ok {
			pid, err := jsonString(it["participant_id"])
			if err != nil {
				t.Fatalf("invalid participant_id: %v", err)
			}
			t.Fatalf("tenant-b must not see tenant-a overlay on %s", pid)
		}
	}
}

// TestConsentFlatIdleOmitsNewFields: a fresh handler (restart semantics) never
// emits active_batches or delivery_status — persisted consent_status is truth.
func TestConsentFlatIdleOmitsNewFields(t *testing.T) {
	repo := &fakeConsentRepo{rows: []repository.ConsentFlatRow{
		{ParticipantID: "p1", ChildName: "Budi", SessionID: consentSessionID, ConsentStatus: "not_sent"},
	}}
	h, e := newConsentFixture(repo, &fakeConsentSessionRepo{}, &blockMessenger{started: make(chan struct{}, 1), release: make(chan struct{})})

	data := flatGET(t, h, e, consentTenantA)
	if _, ok := data["active_batches"]; ok {
		t.Fatal("fresh process must omit active_batches")
	}
	var items []map[string]json.RawMessage
	if err := json.Unmarshal(data["items"], &items); err != nil || len(items) != 1 {
		t.Fatalf("invalid items: %v", err)
	}
	if _, ok := items[0]["delivery_status"]; ok {
		t.Fatal("fresh process must omit per-item delivery_status")
	}
	if _, ok := items[0]["consent_status"]; !ok {
		t.Fatal("existing consent_status must stay untouched")
	}
}

// TestConsentRegistryRetentionBound: only the newest ConsentBatchRetention
// batches are kept; the oldest is evicted (its overlay disappears).
func TestConsentRegistryRetentionBound(t *testing.T) {
	reg := handler.NewConsentBatchRegistry()
	n := handler.ConsentBatchRetention + 1
	for i := range n {
		reg.Register("batch-"+strconv.Itoa(i), consentSessionID, consentTenantA, []string{"p-" + strconv.Itoa(i)})
	}
	if got := reg.Len(); got != handler.ConsentBatchRetention {
		t.Fatalf("registry size = %d, want bounded %d", got, handler.ConsentBatchRetention)
	}
	overlay := reg.Overlay(consentTenantA)
	if _, evicted := overlay["p-0"]; evicted {
		t.Fatal("oldest batch must be evicted")
	}
	if _, kept := overlay["p-"+strconv.Itoa(n-1)]; !kept {
		t.Fatal("newest batch must be retained")
	}
	// Dropping a status update for an evicted batch must not panic.
	reg.SetStatus("batch-0", "p-0", handler.ConsentStatusSent, "")
}

// TestConsentRegistryTenantIsolation: Overlay/ActiveBatches are tenant-scoped.
func TestConsentRegistryTenantIsolation(t *testing.T) {
	reg := handler.NewConsentBatchRegistry()
	reg.Register("batch-a", consentSessionID, consentTenantA, []string{"p1"})
	reg.SetStatus("batch-a", "p1", handler.ConsentStatusProcessing, "")

	if len(reg.ActiveBatches(consentTenantB)) != 0 {
		t.Fatal("tenant-b must not see tenant-a batches")
	}
	if len(reg.Overlay(consentTenantB)) != 0 {
		t.Fatal("tenant-b must not see tenant-a overlay")
	}
	if reg.Overlay(consentTenantA)["p1"] != handler.ConsentStatusProcessing {
		t.Fatal("tenant-a must see its own overlay")
	}
}

func jsonString(raw json.RawMessage) (string, error) {
	var s string
	err := json.Unmarshal(raw, &s)
	return s, err
}

func keysOf(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
