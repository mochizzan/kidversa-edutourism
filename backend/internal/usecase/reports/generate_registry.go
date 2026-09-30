package reports

import (
	"sort"
	"sync"
	"time"
)

// GenerateStatus is a point-in-time snapshot of an in-flight session generate
// run, as exposed by the reports list envelope (active_generate).
type GenerateStatus struct {
	SessionID     string
	TenantID      string
	StartedAt     time.Time
	QueuedIDs     []string
	ProcessingIDs []string
}

// generateRun is one session's worklist during a blocking GenerateForSession.
type generateRun struct {
	tenantID   string
	startedAt  time.Time
	queued     map[string]bool
	processing map[string]bool
}

// generateRegistry is the usecase-level, mutex-guarded source of truth for
// per-report generation status. Rows are queued when the worklist is
// enqueued, move to processing when the semaphore is acquired, and are removed
// when their draft persist finishes (or the attempt errors). GenerateForSession
// guarantees cleanup on every return path via defer end(), so a fresh process
// (empty registry) always means "not generating" — persisted drafts win.
type generateRegistry struct {
	mu   sync.Mutex
	runs map[string]*generateRun // keyed by session ID
}

func newGenerateRegistry() *generateRegistry {
	return &generateRegistry{runs: make(map[string]*generateRun)}
}

// begin registers reportIDs as the queued worklist for a session, replacing
// any stale run for that session (genMu upstream prevents overlap anyway).
func (g *generateRegistry) begin(sessionID, tenantID string, reportIDs []string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	run := &generateRun{
		tenantID:   tenantID,
		startedAt:  time.Now().UTC(),
		queued:     make(map[string]bool, len(reportIDs)),
		processing: make(map[string]bool),
	}
	for _, id := range reportIDs {
		run.queued[id] = true
	}
	g.runs[sessionID] = run
}

// markProcessing moves a report from queued to processing (semaphore acquired).
// A missing run cannot happen while goroutines are alive (end() runs after
// wg.Wait); the no-op keeps the worker path panic-free.
func (g *generateRegistry) markProcessing(sessionID, reportID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	run := g.runs[sessionID]
	if run == nil {
		return
	}
	delete(run.queued, reportID)
	run.processing[reportID] = true
}

// remove drops a report from the run (draft persisted, or attempt failed —
// deferred in the worker so every exit path cleans up).
func (g *generateRegistry) remove(sessionID, reportID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	run := g.runs[sessionID]
	if run == nil {
		return
	}
	delete(run.queued, reportID)
	delete(run.processing, reportID)
}

// end drops the session's run entirely (deferred cleanup in GenerateForSession).
func (g *generateRegistry) end(sessionID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.runs, sessionID)
}

// status returns the snapshot for (session, tenant); ok=false when no run is
// active for that session or the run belongs to another tenant.
func (g *generateRegistry) status(sessionID, tenantID string) (GenerateStatus, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	run := g.runs[sessionID]
	if run == nil || run.tenantID != tenantID {
		return GenerateStatus{}, false
	}
	return GenerateStatus{
		SessionID:     sessionID,
		TenantID:      run.tenantID,
		StartedAt:     run.startedAt,
		QueuedIDs:     sortedIDSet(run.queued),
		ProcessingIDs: sortedIDSet(run.processing),
	}, true
}

// sortedIDSet returns the set's keys in deterministic (sorted) order; never nil
// so the JSON envelope always renders [] rather than null.
func sortedIDSet(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// GenerateStatus exposes the live generation registry for a session. Reports
// false after the run completes, errors out, or on a fresh process/restart.
func (u *Usecase) GenerateStatus(sessionID, tenantID string) (GenerateStatus, bool) {
	return u.genReg.status(sessionID, tenantID)
}
