package handler

import (
	"fmt"
	"sync"
	"time"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// ReportSendRunTTL is how long a send run may go without an update before it
// is considered abandoned and lazily evicted (checked on read and write).
const ReportSendRunTTL = 5 * time.Minute

// reportSendRun is one session's declared send queue for a tenant.
type reportSendRun struct {
	tenantID  string
	sessionID string
	queued    map[string]bool // declared set: all reports still to send in this run
	sending   map[string]bool // targets with an in-flight attempt
	updatedAt time.Time
}

// ReportSendQueue is the in-memory, mutex-guarded source of truth for
// POST /api/reports/:id/send attempts, keyed by (tenant, session). It backs
// the active_send envelope of GET /api/reports and the send_in_progress 409
// guard. Process-local: empty after a restart (persisted SENT/SEND_FAILED
// remains the fallback truth).
type ReportSendQueue struct {
	// TTL is the stale-run eviction threshold (defaults to ReportSendRunTTL).
	// Written once at construction (tests shorten it); read under mu afterwards.
	TTL  time.Duration
	mu   sync.Mutex
	runs map[string]*reportSendRun
}

// NewReportSendQueue builds an empty send queue.
func NewReportSendQueue() *ReportSendQueue {
	return &ReportSendQueue{TTL: ReportSendRunTTL, runs: make(map[string]*reportSendRun)}
}

func sendRunKey(tenantID, sessionID string) string { return tenantID + "\x00" + sessionID }

// Begin atomically guards and registers one send attempt: it fails with
// 409 send_in_progress when the target is already in flight in ANY run, else
// upserts run.queued to the declared set, adds the target to run.sending and
// stamps updated_at. Last-writer-wins on competing declarations.
func (q *ReportSendQueue) Begin(tenantID, sessionID, target string, declared []string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.evictStaleLocked(time.Now().UTC())
	for _, run := range q.runs {
		if run.sending[target] {
			return apperrors.Conflict("send_in_progress",
				fmt.Errorf("report %s is already being sent", target))
		}
	}
	key := sendRunKey(tenantID, sessionID)
	run := q.runs[key]
	if run == nil {
		run = &reportSendRun{
			tenantID:  tenantID,
			sessionID: sessionID,
			queued:    make(map[string]bool),
			sending:   make(map[string]bool),
		}
		q.runs[key] = run
	}
	run.queued = make(map[string]bool, len(declared))
	for _, id := range declared {
		run.queued[id] = true
	}
	run.sending[target] = true
	run.updatedAt = time.Now().UTC()
	return nil
}

// Finish marks one attempt done (success OR error): the target leaves queued
// and sending, updated_at is stamped, and the run auto-deletes once nothing is
// declared and nothing is in flight.
func (q *ReportSendQueue) Finish(tenantID, sessionID, target string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	run := q.runs[sendRunKey(tenantID, sessionID)]
	if run == nil {
		return
	}
	delete(run.queued, target)
	delete(run.sending, target)
	run.updatedAt = time.Now().UTC()
	if len(run.queued) == 0 && len(run.sending) == 0 {
		delete(q.runs, sendRunKey(tenantID, sessionID))
	}
}

// ActiveSend returns the active_send snapshot for (tenant, session), or nil
// when idle, tenant-mismatched or TTL-evicted. Lazy TTL eviction runs here too.
func (q *ReportSendQueue) ActiveSend(tenantID, sessionID string) *dto.ReportActiveSend {
	if sessionID == "" {
		return nil
	}
	q.mu.Lock()
	defer q.mu.Unlock()
	q.evictStaleLocked(time.Now().UTC())
	run := q.runs[sendRunKey(tenantID, sessionID)]
	if run == nil {
		return nil
	}
	return &dto.ReportActiveSend{
		SessionID:  run.sessionID,
		UpdatedAt:  run.updatedAt.Format(time.RFC3339),
		QueuedIDs:  sortedKeys(run.queued),
		SendingIDs: sortedKeys(run.sending),
	}
}

// evictStaleLocked drops runs that have not been updated within TTL.
// Callers must hold q.mu.
func (q *ReportSendQueue) evictStaleLocked(now time.Time) {
	ttl := q.TTL
	if ttl <= 0 {
		ttl = ReportSendRunTTL
	}
	for key, run := range q.runs {
		if now.Sub(run.updatedAt) > ttl {
			delete(q.runs, key)
		}
	}
}
