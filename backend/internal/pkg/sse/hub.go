package sse

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"

	"kidversa-edutourism-backend/internal/pkg/constants"
)

// Event is a single SSE message published on a channel.
type Event struct {
	// ID is a monotonic per-channel counter (used for Last-Event-ID replay).
	ID uint64 `json:"id"`
	// UUID is a globally-unique id for dedupe.
	UUID string      `json:"uuid"`
	Type string      `json:"type"`
	Data interface{} `json:"data"`
	TS   int64       `json:"ts"`
}

// ReplayGap is returned by ReplaySince when the requested cursor is older than the buffer.
type ReplayGap struct{}

func (ReplayGap) Error() string { return "replay gap: cursor outside buffered window" }

// perChannelState holds the monotonic counter + bounded ring buffer + subscriber set per channel.
type perChannelState struct {
	counter uint64
	bufMu   sync.RWMutex
	buf     []Event // bounded ring, newest at end
	cap     int

	mu      sync.RWMutex
	clients map[string]chan Event

	// lastActive is the last Publish/Subscribe/unsubscribe activity.
	// Guarded by the Hub's mu (never by pc.mu) — all stamps go through
	// getOrCreate or the unsubscribe func, both under hub mu.
	lastActive time.Time
}

// Hub is an in-memory SSE pub/sub hub (single-instance v1).
// SSE holds zero DB connections: Publish is pure in-memory; only the one-shot
// snapshot read (in the handler) touches the database.
type Hub struct {
	mu       sync.RWMutex
	channels map[string]*perChannelState

	connected int64
	published int64
	dropped   int64
	slow      int64

	// sweepTick counts Publish calls; maybeSweep runs an idle sweep every
	// 128th call (or immediately when over SSEMaxChannels).
	sweepTick uint64
	// now is the clock for idle expiry; nil means time.Now. Tests override it.
	now func() time.Time
}

// NewHub creates an empty hub.
func NewHub() *Hub {
	return &Hub{channels: make(map[string]*perChannelState), now: time.Now}
}

// nowOrDefault returns the hub clock (time.Now outside tests).
func (h *Hub) nowOrDefault() time.Time {
	if h.now != nil {
		return h.now()
	}
	return time.Now()
}

func (h *Hub) getOrCreate(ch string) *perChannelState {
	h.mu.Lock()
	defer h.mu.Unlock()
	pc, ok := h.channels[ch]
	if !ok {
		pc = &perChannelState{cap: constants.SSEBufferSize, buf: make([]Event, 0, constants.SSEBufferSize), clients: make(map[string]chan Event)}
		h.channels[ch] = pc
	}
	// Stamp on create + on every Publish/Subscribe hit (both call sites go
	// through here). Guarded by the Hub's mu — never by pc.mu.
	pc.lastActive = h.nowOrDefault()
	return pc
}

// get returns the channel state without creating it (read paths such as
// ReplaySince must not grow the channel map).
func (h *Hub) get(ch string) *perChannelState {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.channels[ch]
}

// sweepIdleLocked deletes subscriber-less channels idle longer than
// SSEIdleChannelTTL. Caller must hold h.mu (Lock). Lock discipline: hub mu
// → pc mu RLock, never inverted — same as the old cleanupEmptyChannels.
func (h *Hub) sweepIdleLocked() {
	now := h.nowOrDefault()
	for ch, pc := range h.channels {
		pc.mu.RLock()
		empty := len(pc.clients) == 0
		pc.mu.RUnlock()
		if empty && now.Sub(pc.lastActive) > constants.SSEIdleChannelTTL {
			delete(h.channels, ch)
		}
	}
}

// Subscribe joins a channel; returns an event channel and an unsubscribe func.
func (h *Hub) Subscribe(_ context.Context, ch string) (<-chan Event, func(), error) {
	pc := h.getOrCreate(ch)
	cid := uuid.NewString()
	ec := make(chan Event, constants.SSEChannelBuffer)
	pc.mu.Lock()
	pc.clients[cid] = ec
	pc.mu.Unlock()
	atomic.AddInt64(&h.connected, 1)

	unsub := func() {
		pc.mu.Lock()
		delete(pc.clients, cid)
		pc.mu.Unlock()
		atomic.AddInt64(&h.connected, -1)
		// Stamp-and-keep: leave the emptied channel in place so a reconnect
		// within SSEIdleChannelTTL can still ReplaySince its buffered window.
		// The opportunistic idle sweep reaps it once it goes quiet past GRACE.
		h.mu.Lock()
		if cur, ok := h.channels[ch]; ok && cur == pc {
			cur.lastActive = h.nowOrDefault()
		}
		h.mu.Unlock()
	}
	return ec, unsub, nil
}

// Publish broadcasts an event to all subscribers of a channel (non-blocking, drop on slow clients).
func (h *Hub) Publish(_ context.Context, ch string, ev Event) error {
	pc := h.getOrCreate(ch)
	h.maybeSweep()
	ev.UUID = uuid.NewString()
	ev.ID = atomic.AddUint64(&pc.counter, 1)
	ev.TS = time.Now().UnixMilli()

	// ring buffer append (cap 64)
	pc.bufMu.Lock()
	pc.buf = append(pc.buf, ev)
	if len(pc.buf) > pc.cap {
		pc.buf = pc.buf[len(pc.buf)-pc.cap:]
	}
	pc.bufMu.Unlock()

	pc.mu.RLock()
	clients := make([]chan Event, 0, len(pc.clients))
	for _, c := range pc.clients {
		clients = append(clients, c)
	}
	pc.mu.RUnlock()

	atomic.AddInt64(&h.published, 1)
	for _, c := range clients {
		select {
		case c <- ev:
		default:
			atomic.AddInt64(&h.dropped, 1)
			atomic.AddInt64(&h.slow, 1)
		}
	}
	return nil
}

// maybeSweep runs an idle sweep every 128th Publish, or immediately when
// the channel count exceeds SSEMaxChannels. Cheap-path first: the counter
// check avoids taking the write lock on ordinary publishes.
func (h *Hub) maybeSweep() {
	tick := atomic.AddUint64(&h.sweepTick, 1)
	if tick%128 != 0 {
		h.mu.RLock()
		over := len(h.channels) > constants.SSEMaxChannels
		h.mu.RUnlock()
		if !over {
			return
		}
	}
	h.mu.Lock()
	h.sweepIdleLocked()
	h.mu.Unlock()
}

// ReplaySince returns events with counter > since. A since of 0 means "replay
// the entire buffered window" (the caller has no cursor yet), so it never
// returns ReplayGap — returning an empty slice instead. ReplayGap is reserved
// for a cursor that was once valid but has since been evicted (since > 0 and
// below the current buffer head). This keeps early SSE events from being lost
// when a subscriber connects just after publishing started.
func (h *Hub) ReplaySince(ch string, since uint64) ([]Event, error) {
	pc := h.get(ch)
	if pc == nil {
		return nil, nil
	}
	pc.bufMu.RLock()
	defer pc.bufMu.RUnlock()
	if len(pc.buf) == 0 {
		return nil, nil
	}
	head := pc.buf[0].ID
	// since == 0: caller has no cursor → replay everything in the buffer.
	if since == 0 {
		out := make([]Event, len(pc.buf))
		copy(out, pc.buf)
		return out, nil
	}
	if since < head {
		return nil, ReplayGap{}
	}
	out := make([]Event, 0)
	for _, e := range pc.buf {
		if e.ID > since {
			out = append(out, e)
		}
	}
	return out, nil
}

// Shutdown closes all subscriber channels, prompting connected EventSources to reconnect gracefully.
func (h *Hub) Shutdown(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, pc := range h.channels {
		pc.mu.Lock()
		for cid, c := range pc.clients {
			close(c)
			delete(pc.clients, cid)
		}
		pc.mu.Unlock()
	}
	h.channels = make(map[string]*perChannelState)
	return nil
}
