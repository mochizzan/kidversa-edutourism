package reports

import (
	"sort"
	"strings"
	"sync"
	"time"
)

// Per-report lifecycle states inside one generate run (active_generate items).
const (
	GenerateItemQueued     = "queued"
	GenerateItemProcessing = "processing"
	GenerateItemSuccess    = "success"
	GenerateItemError      = "error"
	// GenerateItemSkipped marks a phase (or the whole item) that was
	// INTENTIONALLY not generated — never a failure, never silent: the
	// machine-readable reason travels alongside via the SkipReason* codes.
	GenerateItemSkipped = "skipped"
)

// Machine-readable skip reasons recorded per item in the generation registry
// and surfaced through active_generate (mission_skip_reason /
// narrative_skip_reason). Locked API contract: the frontend switches on these
// exact strings.
const (
	// SkipReasonMissionBankEmpty: the report's Topic mission bank has no
	// active missions, so there is nothing to recommend or persist — the
	// report is narrative-only.
	SkipReasonMissionBankEmpty = "mission_bank_empty"
	// SkipReasonNoAssessments: the participant has no assessments for the
	// report's Topic, so a narrative would be empty — the report is
	// missions-only (or fully skipped when the mission phase skipped too).
	SkipReasonNoAssessments = "no_assessments"
)

// Phases a worklist report moves through during a run: the narrative worker
// (draft text) and the mission-selection pass (H's phase) run concurrently.
const (
	GeneratePhaseNarrative = "narrative"
	GeneratePhaseMissions  = "missions"
)

// GenerateItem is one report's point-in-time state in an active run, as
// exposed by the active_generate envelope (status derived from the two
// phases — see deriveGenerateItem).
type GenerateItem struct {
	ReportID string
	Status   string // queued|processing|success|error|skipped
	Phase    string // narrative|missions — set while processing or on failure
	Error    string // failure message when Status == error
	// MissionSkipReason / NarrativeSkipReason are the machine-readable
	// SkipReason* codes for phases that were intentionally not generated.
	// They are carried on every status (a partial skip keeps status=success
	// with the reason attached); empty when the phase was not skipped.
	MissionSkipReason   string
	NarrativeSkipReason string
}

// GenerateStatus is a point-in-time snapshot of an in-flight session generate
// run, as exposed by the reports list envelope (active_generate).
type GenerateStatus struct {
	SessionID string
	TenantID  string
	StartedAt time.Time
	// QueuedIDs / ProcessingIDs are the NARRATIVE-phase views of the worklist
	// (report whose draft text is still enqueued / being generated). They keep
	// the pre-existing envelope semantics; Items carries the richer per-report
	// state (narrative AND mission phase combined).
	QueuedIDs     []string
	ProcessingIDs []string
	// Items is one entry per worklist report, sorted by report id.
	Items []GenerateItem
	// Aggregates over Items' derived status. Skipped items (nothing
	// generated) count in neither Succeeded nor ErrorCount — the per-item
	// status + skip reasons carry their outcome.
	Total      int
	Queued     int
	Processing int
	Succeeded  int
	ErrorCount int
	// Failed maps reportID → the derived per-item failure message (both
	// phases). Entries live until end() drops the run, so a status consumer
	// can report them for the whole run.
	Failed map[string]string
}

// generatePhase tracks one phase of a report within a run. The zero status
// for the mission phase means "not applicable / not started" (a report that
// already carries missions never enters it); the narrative phase is always
// present because the worklist IS the narrative worklist. status may also be
// GenerateItemSkipped, in which case skip carries the SkipReason* code.
type generatePhase struct {
	status string
	err    string // failure message when status == GenerateItemError
	skip   string // machine-readable reason when status == GenerateItemSkipped
}

// generateItem is the registry-side state of one worklist report.
type generateItem struct {
	narrative generatePhase
	missions  generatePhase
}

// deriveGenerateItem folds the two phase states into the single
// status+phase+error(+skip reason) triple the envelope exposes. Priority: any
// phase error wins (narrative message first, missions message appended), then
// in-flight progress (narrative is the primary work, then a still-running
// mission pass), then the both-skipped outcome — NOTHING was generated this
// run — and finally success. A phase that skipped while the other produced
// output is a PARTIAL skip: status stays success and the reason travels on
// the item. Skip reasons are copied onto the item regardless of status.
func deriveGenerateItem(it *generateItem) GenerateItem {
	var out GenerateItem
	nar, mis := it.narrative, it.missions
	out.MissionSkipReason = mis.skip
	out.NarrativeSkipReason = nar.skip
	switch {
	case nar.status == GenerateItemError || mis.status == GenerateItemError:
		out.Status = GenerateItemError
		switch {
		case nar.status == GenerateItemError && mis.status == GenerateItemError:
			out.Phase = GeneratePhaseNarrative
			out.Error = strings.TrimSpace(nar.err + "; " + mis.err)
		case nar.status == GenerateItemError:
			out.Phase = GeneratePhaseNarrative
			out.Error = nar.err
		default:
			out.Phase = GeneratePhaseMissions
			out.Error = mis.err
		}
	case nar.status == GenerateItemProcessing:
		out.Status = GenerateItemProcessing
		out.Phase = GeneratePhaseNarrative
	case nar.status == GenerateItemQueued:
		out.Status = GenerateItemQueued
	case mis.status == GenerateItemProcessing:
		// Narrative done (or skipped), mission pass still running.
		out.Status = GenerateItemProcessing
		out.Phase = GeneratePhaseMissions
	case nar.status == GenerateItemSkipped && mis.status != GenerateItemSuccess:
		// Narrative skipped AND the mission phase produced nothing either
		// (also skipped, or never applicable because missions pre-existed) →
		// nothing was generated for this report in this run.
		out.Status = GenerateItemSkipped
	default:
		out.Status = GenerateItemSuccess
	}
	return out
}

// generateRun is one session's worklist during a generate run.
type generateRun struct {
	tenantID  string
	startedAt time.Time
	items     map[string]*generateItem // keyed by report id
}

// generateRegistry is the usecase-level, mutex-guarded source of truth for
// per-report generation status. Rows are registered as queued with the
// worklist, move through processing to success/error per phase, and every
// entry (including terminal ones) stays observable until end() drops the run
// — so a status consumer can report per-item outcomes for the whole run.
// GenerateForSession guarantees cleanup on every return path via defer end(),
// so a fresh process (empty registry) always means "not generating" —
// persisted evidence (draft + missions) wins.
type generateRegistry struct {
	mu   sync.Mutex
	runs map[string]*generateRun // keyed by session ID
}

func newGenerateRegistry() *generateRegistry {
	return &generateRegistry{runs: make(map[string]*generateRun)}
}

// begin registers reportIDs as the queued worklist for a session, replacing
// any stale run for that session (genMu upstream prevents overlap anyway).
// An empty reportIDs registers an empty run — the handler uses that to expose
// the run from the moment the 202 is returned, before the worker's begin()
// replaces it with the real worklist.
func (g *generateRegistry) begin(sessionID, tenantID string, reportIDs []string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	run := &generateRun{
		tenantID:  tenantID,
		startedAt: time.Now().UTC(),
		items:     make(map[string]*generateItem, len(reportIDs)),
	}
	for _, id := range reportIDs {
		run.items[id] = &generateItem{narrative: generatePhase{status: GenerateItemQueued}}
	}
	g.runs[sessionID] = run
}

// item returns the report's registry entry; nil when the run or the item is
// missing (no-op keeps the worker path panic-free after end()).
func (g *generateRegistry) item(sessionID, reportID string) *generateItem {
	run := g.runs[sessionID]
	if run == nil {
		return nil
	}
	return run.items[reportID]
}

// markProcessing moves a report's narrative phase from queued to processing
// (semaphore acquired). A missing run cannot happen while goroutines are
// alive (end() runs after wg.Wait); the no-op keeps the worker path safe.
func (g *generateRegistry) markProcessing(sessionID, reportID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if it := g.item(sessionID, reportID); it != nil && it.narrative.status == GenerateItemQueued {
		it.narrative.status = GenerateItemProcessing
	}
}

// markNarrativeSuccess records that the draft text was persisted for the
// report (narrative phase terminal success).
func (g *generateRegistry) markNarrativeSuccess(sessionID, reportID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if it := g.item(sessionID, reportID); it != nil && it.narrative.status == GenerateItemProcessing {
		it.narrative.status = GenerateItemSuccess
	}
}

// markNarrativeFailed records a per-item narrative failure (generation error
// or persist error) with a clear message. The aggregate run error is still
// returned by GenerateForSession — this only makes the failure observable
// per report while the run is visible.
func (g *generateRegistry) markNarrativeFailed(sessionID, reportID, msg string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if it := g.item(sessionID, reportID); it != nil && it.narrative.status != GenerateItemSuccess {
		it.narrative.status = GenerateItemError
		it.narrative.err = msg
	}
}

// markNarrativeSkipped records that the narrative phase was intentionally
// skipped for the report (reason = a machine-readable SkipReason* code), e.g.
// no assessments for the report's Topic. Only valid from processing — the
// worker marks processing before running the skip gate — so a terminal state
// (success/error) is never overwritten.
func (g *generateRegistry) markNarrativeSkipped(sessionID, reportID, reason string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if it := g.item(sessionID, reportID); it != nil && it.narrative.status == GenerateItemProcessing {
		it.narrative.status = GenerateItemSkipped
		it.narrative.skip = reason
	}
}

// markMissionsProcessing records that the mission-selection pass started for
// the report (phase channeling only — the mission logic itself lives in
// GenerateForSession).
func (g *generateRegistry) markMissionsProcessing(sessionID, reportID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if it := g.item(sessionID, reportID); it != nil {
		it.missions.status = GenerateItemProcessing
	}
}

// markMissionsSuccess records that the mission selection was persisted
// (ReplaceByReport) for the report.
func (g *generateRegistry) markMissionsSuccess(sessionID, reportID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if it := g.item(sessionID, reportID); it != nil && it.missions.status == GenerateItemProcessing {
		it.missions.status = GenerateItemSuccess
	}
}

// markMissionsSkipped records that the mission-selection pass was
// intentionally skipped for the report (reason = a machine-readable
// SkipReason* code), e.g. the Topic's mission bank is empty. Only valid from
// processing — mirroring markMissionsSuccess — so a terminal state is never
// overwritten.
func (g *generateRegistry) markMissionsSkipped(sessionID, reportID, reason string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if it := g.item(sessionID, reportID); it != nil && it.missions.status == GenerateItemProcessing {
		it.missions.status = GenerateItemSkipped
		it.missions.skip = reason
	}
}

// markFailed records a per-item mission-phase failure with a clear message
// (recommender error or persist error — an empty mission bank is an explicit
// skip via markMissionsSkipped, not a failure).
// The narrative attempt for the same report is unaffected — the item's
// derived status just becomes error with phase=missions. A missing run is a
// no-op so the worker path stays panic-free.
func (g *generateRegistry) markFailed(sessionID, reportID, msg string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if it := g.item(sessionID, reportID); it != nil {
		it.missions.status = GenerateItemError
		it.missions.err = msg
	}
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
	st := GenerateStatus{
		SessionID:     sessionID,
		TenantID:      run.tenantID,
		StartedAt:     run.startedAt,
		Items:         make([]GenerateItem, 0, len(run.items)),
		Failed:        make(map[string]string),
		QueuedIDs:     make([]string, 0, len(run.items)),
		ProcessingIDs: make([]string, 0, len(run.items)),
	}
	ids := make([]string, 0, len(run.items))
	for id := range run.items {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		it := run.items[id]
		derived := deriveGenerateItem(it)
		derived.ReportID = id
		st.Items = append(st.Items, derived)
		st.Total++
		switch derived.Status {
		case GenerateItemQueued:
			st.Queued++
		case GenerateItemProcessing:
			st.Processing++
		case GenerateItemSuccess:
			st.Succeeded++
		case GenerateItemError:
			st.ErrorCount++
			st.Failed[id] = derived.Error
		}
		// Legacy narrative-phase views (kept for the queued_ids /
		// processing_ids envelope fields and existing consumers).
		switch it.narrative.status {
		case GenerateItemQueued:
			st.QueuedIDs = append(st.QueuedIDs, id)
		case GenerateItemProcessing:
			st.ProcessingIDs = append(st.ProcessingIDs, id)
		}
	}
	return st, true
}

// GenerateStatus exposes the live generation registry for a session. Reports
// false after the run completes, errors out, or on a fresh process/restart.
func (u *Usecase) GenerateStatus(sessionID, tenantID string) (GenerateStatus, bool) {
	return u.genReg.status(sessionID, tenantID)
}

// BeginGenerateRun registers an empty run for the session so the reports
// envelope (active_generate) is live from the moment the async generate POST
// returns 202 — before the worker's own begin() replaces it with the real
// worklist. Also guarantees the registry entry is dropped if the worker dies
// before its begin() ran (EndGenerateRun below).
func (u *Usecase) BeginGenerateRun(sessionID, tenantID string) {
	u.genReg.begin(sessionID, tenantID, nil)
}

// EndGenerateRun drops any leftover registry entry for the session. Safe to
// call after GenerateForSession already cleaned up (end() is idempotent).
func (u *Usecase) EndGenerateRun(sessionID string) {
	u.genReg.end(sessionID)
}
