package handler

import (
	"log"
	"sort"
	"sync"
	"time"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
)

// Per-participant delivery states tracked by the consent batch registry.
// Values are part of the fixed JSON contract (delivery_status).
const (
	ConsentStatusQueued     = "queued"
	ConsentStatusProcessing = "processing"
	ConsentStatusSent       = "sent"
	ConsentStatusFailed     = "failed"
)

// ConsentBatchRetention bounds the registry: only the newest N batches are
// kept (oldest evicted), so completed batches keep their terminal overlay
// until they age out or the server restarts.
const ConsentBatchRetention = 20

// consentParticipantStatus is one participant's state inside a batch.
type consentParticipantStatus struct {
	status string
	err    string // failure detail (stored for diagnostics; not serialized)
}

// consentBatch is a registered send-whatsapp batch.
type consentBatch struct {
	batchID      string
	sessionID    string
	tenantID     string
	startedAt    time.Time
	participants map[string]consentParticipantStatus
}

// ConsentBatchRegistry is the in-memory source of truth for per-individual
// consent delivery status. It lives on ConsentHandler, is guarded by a mutex,
// and is intentionally process-local: after a restart it is empty and the
// flat response falls back to persisted consent_status.
type ConsentBatchRegistry struct {
	mu      sync.Mutex
	order   []string // batch IDs in registration order (oldest first)
	batches map[string]*consentBatch
}

// NewConsentBatchRegistry builds an empty registry.
func NewConsentBatchRegistry() *ConsentBatchRegistry {
	return &ConsentBatchRegistry{batches: make(map[string]*consentBatch)}
}

// Register records a batch with every member participant as "queued".
// Called synchronously by SendWhatsApp BEFORE the 202 is returned. Evicts the
// oldest batches beyond ConsentBatchRetention.
func (r *ConsentBatchRegistry) Register(batchID, sessionID, tenantID string, participantIDs []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.batches[batchID]; exists {
		log.Printf("consent: batch registry overwrite of duplicate batch %s", batchID)
	}
	b := &consentBatch{
		batchID:      batchID,
		sessionID:    sessionID,
		tenantID:     tenantID,
		startedAt:    time.Now().UTC(),
		participants: make(map[string]consentParticipantStatus, len(participantIDs)),
	}
	for _, id := range participantIDs {
		b.participants[id] = consentParticipantStatus{status: ConsentStatusQueued}
	}
	r.batches[batchID] = b
	r.order = append(r.order, batchID)
	for len(r.order) > ConsentBatchRetention {
		oldest := r.order[0]
		r.order = r.order[1:]
		delete(r.batches, oldest)
	}
}

// SetStatus updates one participant's state inside a batch (processing →
// sent/failed per attempt). A batch that was already evicted by retention is
// dropped with context — the SSE stream for it is finished, so nothing is lost
// silently.
func (r *ConsentBatchRegistry) SetStatus(batchID, participantID, status, errMsg string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	b, ok := r.batches[batchID]
	if !ok {
		log.Printf("consent: registry status %q dropped for participant %s: batch %s no longer retained", status, participantID, batchID)
		return
	}
	b.participants[participantID] = consentParticipantStatus{status: status, err: errMsg}
}

// Err returns the stored failure detail for a participant ("" if none).
func (r *ConsentBatchRegistry) Err(batchID, participantID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	if b, ok := r.batches[batchID]; ok {
		return b.participants[participantID].err
	}
	return ""
}

// Overlay returns participantID → delivery_status for the given tenant.
// When a participant appears in several retained batches the newest batch
// wins. Empty when the tenant has no retained batches.
func (r *ConsentBatchRegistry) Overlay(tenantID string) map[string]string {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[string]string)
	for _, id := range r.order { // oldest → newest, so later batches overwrite
		b := r.batches[id]
		if b == nil || b.tenantID != tenantID {
			continue
		}
		for pid, st := range b.participants {
			out[pid] = st.status
		}
	}
	return out
}

// ActiveBatches returns the tenant-filtered active_batches snapshot for the
// flat response (registration order, oldest first). Nil when idle.
func (r *ConsentBatchRegistry) ActiveBatches(tenantID string) []dto.ConsentActiveBatch {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []dto.ConsentActiveBatch
	for _, id := range r.order {
		b := r.batches[id]
		if b == nil || b.tenantID != tenantID {
			continue
		}
		sent, failed := 0, 0
		for _, st := range b.participants {
			switch st.status {
			case ConsentStatusSent:
				sent++
			case ConsentStatusFailed:
				failed++
			}
		}
		out = append(out, dto.ConsentActiveBatch{
			BatchID:   b.batchID,
			SessionID: b.sessionID,
			StartedAt: b.startedAt.Format(time.RFC3339),
			Total:     len(b.participants),
			Sent:      sent,
			Failed:    failed,
		})
	}
	return out
}

// Len reports how many batches are currently retained.
func (r *ConsentBatchRegistry) Len() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.batches)
}

// sortedKeys is a small helper shared by the delivery-status registries.
func sortedKeys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
