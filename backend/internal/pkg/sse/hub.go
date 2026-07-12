package sse

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
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

// Backend is the realtime pub/sub abstraction. Use cases/handlers depend on this
// interface, NOT on *Hub, so the in-memory implementation can later be swapped for
// Redis without touching call sites (see RealtimeBackend flag in config).
type Backend interface {
	Subscribe(ctx context.Context, channel string) (<-chan Event, func(), error)
	Publish(ctx context.Context, channel string, ev Event) error
	ReplaySince(channel string, since uint64) ([]Event, error)
	Shutdown(ctx context.Context) error
	Metrics() (connected, published, dropped, slow int64)
}

// perChannelState holds the monotonic counter + bounded ring buffer + subscriber set per channel.
type perChannelState struct {
	counter uint64
	bufMu   sync.RWMutex
	buf     []Event // bounded ring, newest at end
	cap     int

	mu      sync.RWMutex
	clients map[string]chan Event
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
}

// NewHub creates an empty hub.
func NewHub() *Hub {
	return &Hub{channels: make(map[string]*perChannelState)}
}

func (h *Hub) getOrCreate(ch string) *perChannelState {
	h.mu.Lock()
	defer h.mu.Unlock()
	pc, ok := h.channels[ch]
	if !ok {
		pc = &perChannelState{cap: 64, buf: make([]Event, 0, 64), clients: make(map[string]chan Event)}
		h.channels[ch] = pc
	}
	return pc
}

// Subscribe joins a channel; returns an event channel and an unsubscribe func.
func (h *Hub) Subscribe(_ context.Context, ch string) (<-chan Event, func(), error) {
	pc := h.getOrCreate(ch)
	cid := uuid.NewString()
	ec := make(chan Event, 256)
	pc.mu.Lock()
	pc.clients[cid] = ec
	pc.mu.Unlock()
	atomic.AddInt64(&h.connected, 1)

	unsub := func() {
		pc.mu.Lock()
		delete(pc.clients, cid)
		pc.mu.Unlock()
		atomic.AddInt64(&h.connected, -1)
	}
	return ec, unsub, nil
}

// Publish broadcasts an event to all subscribers of a channel (non-blocking, drop on slow clients).
func (h *Hub) Publish(_ context.Context, ch string, ev Event) error {
	pc := h.getOrCreate(ch)
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

// ReplaySince returns events with counter > since. Returns ReplayGap if since is older than buffer head.
func (h *Hub) ReplaySince(ch string, since uint64) ([]Event, error) {
	pc := h.getOrCreate(ch)
	pc.bufMu.RLock()
	defer pc.bufMu.RUnlock()
	if len(pc.buf) == 0 {
		return nil, nil
	}
	head := pc.buf[0].ID
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

// Metrics returns the live hub counters.
func (h *Hub) Metrics() (connected, published, dropped, slow int64) {
	return atomic.LoadInt64(&h.connected), atomic.LoadInt64(&h.published),
		atomic.LoadInt64(&h.dropped), atomic.LoadInt64(&h.slow)
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
