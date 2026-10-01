package reports_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sort"
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
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/reports"
)

const (
	genSessionID = "55555555-5555-5555-5555-555555555555"
	sendReport1  = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	sendReport2  = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
)

// genRepo is an in-memory ReportRepository covering generate + send + list.
// All reads return copies so concurrent workers never share entity pointers.
type genRepo struct {
	repository.ReportRepository
	mu         sync.Mutex
	byID       map[string]entity.Report
	listErrOn  int // fail the Nth List call (0 = never)
	listCalls  int
	updateHits int
}

func newGenRepo(participants ...string) *genRepo {
	r := &genRepo{byID: map[string]entity.Report{}}
	for _, pid := range participants {
		id := "r-" + pid
		r.byID[id] = entity.Report{
			BaseModel:     entity.BaseModel{ID: id},
			ParticipantID: pid,
			SessionID:     genSessionID,
			Status:        entity.ReportDraft,
		}
	}
	return r
}

func (f *genRepo) addReport(id, participantID string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.byID[id] = entity.Report{
		BaseModel:     entity.BaseModel{ID: id},
		ParticipantID: participantID,
		SessionID:     genSessionID,
		Status:        entity.ReportDraft,
	}
}

func (f *genRepo) List(ctx context.Context, rf repository.ReportFilter, page, limit int) (*repository.Paginated[entity.Report], error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.listCalls++
	if f.listErrOn != 0 && f.listCalls == f.listErrOn {
		return nil, errors.New("list boom")
	}
	out := make([]entity.Report, 0, len(f.byID))
	for _, r := range f.byID {
		if rf.SessionID != "" && r.SessionID != rf.SessionID {
			continue
		}
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return &repository.Paginated[entity.Report]{Items: out, Total: len(out)}, nil
}

func (f *genRepo) GetByID(ctx context.Context, id, tenantID string) (*entity.Report, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.byID[id]
	if !ok {
		return nil, apperrors.NotFound("not_found", nil)
	}
	cp := r
	return &cp, nil
}

func (f *genRepo) GetOrCreateDraft(ctx context.Context, participantID, sessionID, programStageID string) (*entity.Report, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, r := range f.byID {
		if r.ParticipantID == participantID && r.ProgramStageID == programStageID {
			cp := r
			return &cp, nil
		}
	}
	id := "draft-" + participantID
	f.byID[id] = entity.Report{
		BaseModel:     entity.BaseModel{ID: id},
		ParticipantID: participantID,
		SessionID:     sessionID,
		Status:        entity.ReportDraft,
	}
	cp := f.byID[id]
	return &cp, nil
}

func (f *genRepo) Update(ctx context.Context, r *entity.Report) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.updateHits++
	cp := *r
	f.byID[r.ID] = cp
	return nil
}

// blockingGen is a controllable NarrativeGenerator: every Generate call signals
// started, then blocks on its own channel (released by the test) or fails
// immediately when failAll is set — or when the report id is listed in failIDs
// (per-report narrative failure, for per-item registry tests).
type blockingGen struct {
	started chan string
	blocks  map[string]chan struct{}
	failAll bool
	failIDs map[string]bool
}

func newBlockingGen(ids ...string) *blockingGen {
	g := &blockingGen{started: make(chan string, 32), blocks: map[string]chan struct{}{}}
	for _, id := range ids {
		g.blocks[id] = make(chan struct{})
	}
	return g
}

func (g *blockingGen) Generate(ctx context.Context, reportID, tenantID string) (string, error) {
	select {
	case g.started <- reportID:
	default:
	}
	if g.failAll || g.failIDs[reportID] {
		return "", errors.New("generation boom")
	}
	ch, ok := g.blocks[reportID]
	if !ok {
		return "draft", nil
	}
	<-ch
	return "draft", nil
}

func (g *blockingGen) StreamGenerate(ctx context.Context, reportID, tenantID string, onDelta func(string) error) (string, error) {
	return "", errors.New("StreamGenerate not exercised by delivery-status tests")
}

// genSessionRepo supplies generate/send session lookups; unused methods panic
// via the embedded nil interface.
type genSessionRepo struct {
	repository.SessionRepository
	participants []entity.Participant
	stages       []entity.SessionStage
}

func (f *genSessionRepo) ListSessionStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error) {
	return f.stages, nil
}

func (f *genSessionRepo) ListParticipants(ctx context.Context, sessionID, groupID, tenantID string) ([]entity.Participant, error) {
	return f.participants, nil
}

func (f *genSessionRepo) GetParticipantByID(ctx context.Context, id, tenantID string) (*entity.Participant, error) {
	for i := range f.participants {
		if f.participants[i].ID == id {
			return &f.participants[i], nil
		}
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (f *genSessionRepo) GetSessionByID(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	return &entity.Session{Name: "Petualangan Sains"}, nil
}

// gateMessenger blocks every gateway send until release is closed.
type gateMessenger struct {
	started chan struct{}
	release chan struct{}
}

func (m *gateMessenger) SendTextMessage(ctx context.Context, chatID, text string) error {
	select {
	case m.started <- struct{}{}:
	default:
	}
	<-m.release
	return nil
}

func newParticipants(n int) []entity.Participant {
	out := make([]entity.Participant, 0, n)
	for i := range n {
		pid := "p-" + string(rune('a'+i))
		out = append(out, entity.Participant{
			BaseModel:   entity.BaseModel{ID: pid},
			ChildName:   "Anak " + pid,
			ParentName:  "Ortu " + pid,
			ParentPhone: "+62 812-3456-7890",
		})
	}
	return out
}

// allReportIDs returns the sorted report IDs newGenRepo seeds for the five
// participants (id scheme "r-"+participantID).
func allReportIDs() []string {
	out := []string{"r-p-a", "r-p-b", "r-p-c", "r-p-d", "r-p-e"}
	sort.Strings(out)
	return out
}

func newUsecaseFixture(repo repository.ReportRepository, gen reports.NarrativeGenerator, sess repository.SessionRepository, msg repository.MessagingService) *reports.Usecase {
	cfg := &config.Config{ParentReportBaseURL: "http://localhost/parent/report", ReportTokenTTL: 168 * time.Hour}
	return reports.NewUsecase(repo, gen, nil, nil, nil, sess, nil, nil, nil, nil, nil, cfg, msg, nil)
}

func newDeliveryHandlerFixture(repo *genRepo, gen *blockingGen, sess *genSessionRepo, msg repository.MessagingService) (*handler.ReportHandler, *echo.Echo) {
	cfg := &config.Config{ParentReportBaseURL: "http://localhost/parent/report", ReportTokenTTL: 168 * time.Hour}
	uc := newUsecaseFixture(repo, gen, sess, msg)
	h := handler.NewReportHandler(uc, cfg, sess, sse.NewHub(), nil, nil)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	return h, e
}

// waitStarted collects n worker-entry signals from the generator.
func waitStarted(t *testing.T, gen *blockingGen, n int) []string {
	t.Helper()
	ids := make([]string, 0, n)
	timeout := time.After(3 * time.Second)
	for range n {
		select {
		case id := <-gen.started:
			ids = append(ids, id)
		case <-timeout:
			t.Fatalf("only %d/%d generate workers started (got %v)", len(ids), n, ids)
		}
	}
	sort.Strings(ids)
	return ids
}

// pollGenerate waits until cond holds for the session's generate status.
func pollGenerate(t *testing.T, uc *reports.Usecase, sessionID, tenantID string, cond func(st reports.GenerateStatus, ok bool) bool, what string) reports.GenerateStatus {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	var last reports.GenerateStatus
	var lastOK bool
	for time.Now().Before(deadline) {
		st, ok := uc.GenerateStatus(sessionID, tenantID)
		if cond(st, ok) {
			return st
		}
		last, lastOK = st, ok
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("timeout waiting for %s (last=%+v ok=%v)", what, last, lastOK)
	return reports.GenerateStatus{}
}

func sortedUnion(st reports.GenerateStatus) []string {
	all := append(append([]string{}, st.QueuedIDs...), st.ProcessingIDs...)
	sort.Strings(all)
	return all
}

// TestGenerateRegistryLifecycle: worklist rows enqueue as queued before spawn,
// move to processing on semaphore acquire, are removed on draft persist, and
// the run is cleaned up on every return path (success here).
func TestGenerateRegistryLifecycle(t *testing.T) {
	repo := newGenRepo("p-a", "p-b", "p-c", "p-d", "p-e")
	gen := newBlockingGen("r-p-a", "r-p-b", "r-p-c", "r-p-d", "r-p-e")
	uc := newUsecaseFixture(repo, gen, nil, nil)
	participants := newParticipants(5)
	wantAll := allReportIDs()

	done := make(chan error, 1)
	go func() {
		_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, participants, nil)
		done <- err
	}()

	// sem=3: exactly three workers reach the generator; the other two must
	// already be enqueued as queued (proves enqueue happens before spawn).
	started := waitStarted(t, gen, 3)
	st := pollGenerate(t, uc, genSessionID, testTenantID,
		func(st reports.GenerateStatus, ok bool) bool {
			return ok && len(st.ProcessingIDs) == 3 && len(st.QueuedIDs) == 2
		}, "3 processing + 2 queued")
	if st.SessionID != genSessionID {
		t.Errorf("session_id = %q, want %q", st.SessionID, genSessionID)
	}
	if got := sortedUnion(st); !equalStrings(got, wantAll) {
		t.Errorf("queued+processing = %v, want all worklist ids %v", got, wantAll)
	}
	if !equalStrings(st.ProcessingIDs, started) {
		t.Errorf("processing = %v, want the started workers %v", st.ProcessingIDs, started)
	}

	// Tenant safety: another tenant never sees the run.
	if _, ok := uc.GenerateStatus(genSessionID, "tenant-other"); ok {
		t.Error("generate run must be tenant-scoped")
	}

	// Release one worker → its row is removed while the run stays active.
	released := started[0]
	close(gen.blocks[released])
	st = pollGenerate(t, uc, genSessionID, testTenantID,
		func(st reports.GenerateStatus, ok bool) bool {
			if !ok {
				return false
			}
			for _, id := range sortedUnion(st) {
				if id == released {
					return false
				}
			}
			return true
		}, "released report removed from the live run")
	if len(sortedUnion(st)) != 4 {
		t.Errorf("expected 4 live rows after one persist, got %v", sortedUnion(st))
	}

	// Let the rest finish → GenerateForSession returns and the run is gone.
	for _, id := range []string{"r-p-a", "r-p-b", "r-p-c", "r-p-d", "r-p-e"} {
		ch := gen.blocks[id]
		select {
		case <-ch:
		default:
			close(ch)
		}
	}
	if err := <-done; err != nil {
		t.Fatalf("GenerateForSession returned error: %v", err)
	}
	if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
		t.Fatal("generate registry must be empty after a successful run")
	}
}

// TestGenerateRegistryCleanupOnErrors: both the worker-error return and a
// repository error after the run started must leave the registry empty.
func TestGenerateRegistryCleanupOnErrors(t *testing.T) {
	t.Run("worker generation error", func(t *testing.T) {
		repo := newGenRepo("p-a", "p-b")
		gen := newBlockingGen()
		gen.failAll = true
		uc := newUsecaseFixture(repo, gen, nil, nil)
		participants := newParticipants(2)

		_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, participants, nil)
		requireAppErrorCode(t, err, "narrative_generation_failed")
		if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
			t.Fatal("registry must be cleaned up after a failed run")
		}
	})

	t.Run("list error after enqueue", func(t *testing.T) {
		repo := newGenRepo("p-a", "p-b")
		repo.listErrOn = 3 // fail the post-generation List (begin already ran)
		gen := newBlockingGen("r-p-a", "r-p-b")
		uc := newUsecaseFixture(repo, gen, nil, nil)
		participants := newParticipants(2)

		done := make(chan error, 1)
		go func() {
			_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, participants, nil)
			done <- err
		}()
		waitStarted(t, gen, 2)
		close(gen.blocks["r-p-a"])
		close(gen.blocks["r-p-b"])
		if err := <-done; err == nil {
			t.Fatal("expected the injected list error to surface")
		}
		if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
			t.Fatal("registry must be cleaned up on the error return path")
		}
	})
}

// listGET decodes the raw `data` object of GET /api/reports?session_id=.
func listGET(t *testing.T, h *handler.ReportHandler, e *echo.Echo, tenantID, sessionID string) map[string]json.RawMessage {
	t.Helper()
	target := "/api/reports"
	if sessionID != "" {
		target += "?session_id=" + sessionID
	}
	req := httptest.NewRequest(http.MethodGet, target, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, tenantID)
	if err := h.ListReports(c); err != nil {
		t.Fatalf("ListReports returned error: %v", err)
	}
	var env map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("invalid list body %q: %v", rec.Body.String(), err)
	}
	var data map[string]json.RawMessage
	if err := json.Unmarshal(env["data"], &data); err != nil {
		t.Fatalf("invalid list data %q: %v", string(env["data"]), err)
	}
	return data
}

// requireExactKeys asserts the JSON object has EXACTLY the given keys.
func requireExactKeys(t *testing.T, obj map[string]json.RawMessage, want ...string) {
	t.Helper()
	if len(obj) != len(want) {
		t.Fatalf("keys = %v, want exactly %v", keysOf(obj), want)
	}
	for _, k := range want {
		if _, ok := obj[k]; !ok {
			t.Fatalf("missing key %q (keys=%v)", k, keysOf(obj))
		}
	}
}

func keysOf(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func jsonString(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		t.Fatalf("not a JSON string: %s (%v)", string(raw), err)
	}
	return s
}

func stringArray(t *testing.T, raw json.RawMessage) []string {
	t.Helper()
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("not a JSON string array: %s (%v)", string(raw), err)
	}
	if out == nil {
		t.Fatalf("array must render as [], got %s", string(raw))
	}
	return out
}

// jsonFloat decodes a JSON number (envelope aggregates).
func jsonFloat(t *testing.T, raw json.RawMessage) float64 {
	t.Helper()
	var f float64
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("not a JSON number: %s (%v)", string(raw), err)
	}
	return f
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// TestListReportsActiveGenerateEnvelope: while the background session generate
// runs, GET /api/reports carries active_generate with the exact contract keys
// (per-report items + aggregates included); it is tenant-filtered and vanishes
// when the run ends (and on a fresh handler instance — restart semantics).
// The POST itself must return 202 promptly — it never waits for the run.
func TestListReportsActiveGenerateEnvelope(t *testing.T) {
	repo := newGenRepo("p-a", "p-b", "p-c", "p-d", "p-e")
	gen := newBlockingGen("r-p-a", "r-p-b", "r-p-c", "r-p-d", "r-p-e")
	sess := &genSessionRepo{participants: newParticipants(5)}
	h, e := newDeliveryHandlerFixture(repo, gen, sess, &gateMessenger{started: make(chan struct{}, 4), release: make(chan struct{})})

	// POST /api/reports/generate is async: it must answer 202 while the
	// narrative workers are still blocked (proof the run is detached).
	type postResult struct {
		err  error
		code int
	}
	runDone := make(chan postResult, 1)
	go func() {
		req := httptest.NewRequest(http.MethodPost, "/api/reports/generate",
			strings.NewReader(`{"session_id":"`+genSessionID+`"}`))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.Set(appmiddleware.CtxTenantID, testTenantID)
		runDone <- postResult{err: h.GenerateForSession(c), code: rec.Code}
	}()
	select {
	case res := <-runDone:
		if res.err != nil {
			t.Fatalf("generate POST returned error: %v", res.err)
		}
		if res.code != http.StatusAccepted {
			t.Fatalf("generate POST status = %d, want 202", res.code)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("generate POST must return 202 without waiting for the run to finish")
	}

	started := waitStarted(t, gen, 3)

	data := listGET(t, h, e, testTenantID, genSessionID)
	if _, ok := data["active_generate"]; !ok {
		t.Fatalf("expected active_generate during run, keys=%v", keysOf(data))
	}
	if _, ok := data["active_send"]; ok {
		t.Fatal("active_send must be absent while no send run exists")
	}
	var ag map[string]json.RawMessage
	if err := json.Unmarshal(data["active_generate"], &ag); err != nil {
		t.Fatalf("invalid active_generate: %v", err)
	}
	requireExactKeys(t, ag, "session_id", "started_at", "queued_ids", "processing_ids",
		"items", "total", "queued", "processing", "succeeded", "failed")
	if got := jsonString(t, ag["session_id"]); got != genSessionID {
		t.Errorf("session_id = %q, want %q", got, genSessionID)
	}
	if _, err := time.Parse(time.RFC3339, jsonString(t, ag["started_at"])); err != nil {
		t.Errorf("started_at is not RFC3339: %v", err)
	}
	if got := stringArray(t, ag["processing_ids"]); !equalStrings(got, started) {
		t.Errorf("processing_ids = %v, want %v", got, started)
	}
	wantQueued := difference(t, allReportIDs(), started)
	if got := stringArray(t, ag["queued_ids"]); !equalStrings(got, wantQueued) {
		t.Errorf("queued_ids = %v, want %v", got, wantQueued)
	}
	// Per-report items: one entry per worklist report, each with a valid
	// lifecycle status (narrative is still in flight, so only these appear).
	var items []map[string]json.RawMessage
	if err := json.Unmarshal(ag["items"], &items); err != nil {
		t.Fatalf("invalid items: %v", err)
	}
	if len(items) != len(allReportIDs()) {
		t.Fatalf("items len = %d, want %d", len(items), len(allReportIDs()))
	}
	itemIDs := make([]string, 0, len(items))
	for _, it := range items {
		id := jsonString(t, it["report_id"])
		itemIDs = append(itemIDs, id)
		status := jsonString(t, it["status"])
		switch status {
		case "queued", "processing", "error":
		default:
			t.Errorf("item %s status = %q, want queued|processing|error while the run is live", id, status)
		}
	}
	sort.Strings(itemIDs)
	if !equalStrings(itemIDs, allReportIDs()) {
		t.Errorf("item report_ids = %v, want %v", itemIDs, allReportIDs())
	}
	// Aggregates are self-consistent (each item counts exactly once) and the
	// run has not finished any narrative yet.
	if got := jsonFloat(t, ag["total"]); got != 5 {
		t.Errorf("total = %v, want 5", got)
	}
	if got := jsonFloat(t, ag["succeeded"]); got != 0 {
		t.Errorf("succeeded = %v, want 0 (narrative workers are blocked)", got)
	}
	if q, p, f := jsonFloat(t, ag["queued"]), jsonFloat(t, ag["processing"]), jsonFloat(t, ag["failed"]); q+p+f != 5 {
		t.Errorf("queued+processing+failed = %v+%v+%v, want 5", q, p, f)
	}

	// Deterministic terminal state: these topic-less reports fail the mission
	// phase (topic_required), so every item ends as error/missions with a
	// message — the envelope must surface phase + error per report.
	deadline := time.Now().Add(3 * time.Second)
	for {
		data = listGET(t, h, e, testTenantID, genSessionID)
		if err := json.Unmarshal(data["active_generate"], &ag); err != nil {
			t.Fatalf("invalid active_generate: %v", err)
		}
		if jsonFloat(t, ag["failed"]) == 5 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("timeout waiting for per-item mission failures (failed=%s)", string(ag["failed"]))
		}
		time.Sleep(5 * time.Millisecond)
	}
	if err := json.Unmarshal(ag["items"], &items); err != nil {
		t.Fatalf("invalid items: %v", err)
	}
	for _, it := range items {
		requireExactKeys(t, it, "report_id", "status", "phase", "error")
		if got := jsonString(t, it["status"]); got != "error" {
			t.Errorf("item %s status = %q, want error", jsonString(t, it["report_id"]), got)
		}
		if got := jsonString(t, it["phase"]); got != "missions" {
			t.Errorf("item %s phase = %q, want missions", jsonString(t, it["report_id"]), got)
		}
		if msg := jsonString(t, it["error"]); !strings.Contains(msg, "topic_required") {
			t.Errorf("item %s error = %q, want it to contain topic_required", jsonString(t, it["report_id"]), msg)
		}
	}
	if q, p, s, f := jsonFloat(t, ag["queued"]), jsonFloat(t, ag["processing"]), jsonFloat(t, ag["succeeded"]), jsonFloat(t, ag["failed"]); q != 0 || p != 0 || s != 0 || f != 5 {
		t.Errorf("aggregates queued/processing/succeeded/failed = %v/%v/%v/%v, want 0/0/0/5", q, p, s, f)
	}

	// Tenant safety: another tenant sees neither flag.
	dataOther := listGET(t, h, e, "tenant-other", genSessionID)
	if _, ok := dataOther["active_generate"]; ok {
		t.Error("active_generate must be tenant-filtered")
	}
	if _, ok := dataOther["active_send"]; ok {
		t.Error("active_send must be tenant-filtered")
	}

	// Restart semantics: a fresh handler (empty registries) never sees the run.
	h2, e2 := newDeliveryHandlerFixture(newGenRepo(), newBlockingGen(), sess, nil)
	dataFresh := listGET(t, h2, e2, testTenantID, genSessionID)
	if _, ok := dataFresh["active_generate"]; ok {
		t.Error("fresh instance must omit active_generate")
	}
	if _, ok := dataFresh["active_send"]; ok {
		t.Error("fresh instance must omit active_send")
	}

	// Finish the run → flag disappears (poll: the 202 returned long ago, so
	// completion must be observed from the envelope itself).
	for _, id := range []string{"r-p-a", "r-p-b", "r-p-c", "r-p-d", "r-p-e"} {
		ch := gen.blocks[id]
		select {
		case <-ch:
		default:
			close(ch)
		}
	}
	deadline = time.Now().Add(3 * time.Second)
	for {
		dataAfter := listGET(t, h, e, testTenantID, genSessionID)
		if _, ok := dataAfter["active_generate"]; !ok {
			requireExactKeys(t, dataAfter, "items")
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("active_generate must vanish after the run completes")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// difference returns sorted a minus b.
func difference(t *testing.T, a, b []string) []string {
	t.Helper()
	set := map[string]bool{}
	for _, id := range b {
		set[id] = true
	}
	out := make([]string, 0, len(a))
	for _, id := range a {
		if !set[id] {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}
