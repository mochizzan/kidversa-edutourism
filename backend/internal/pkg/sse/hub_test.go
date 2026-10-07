package sse

import (
	"context"
	"fmt"
	"testing"
	"time"

	"kidversa-edutourism-backend/internal/pkg/constants"
)

func channelCount(h *Hub) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.channels)
}

func channelPresent(h *Hub, ch string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.channels[ch]
	return ok
}

// Publish-created subscriber-less channels must accumulate (no eager delete):
// N distinct keys with zero subscribers grow the map to N.
func TestHubPublishCreatedEmptyChannelsGrow(t *testing.T) {
	h := NewHub()
	ctx := context.Background()
	const n = 10
	for i := range n {
		if err := h.Publish(ctx, fmt.Sprintf("idle-%d", i), Event{Type: "progress"}); err != nil {
			t.Fatalf("publish %d failed: %v", i, err)
		}
	}
	if got := channelCount(h); got != n {
		t.Fatalf("channel count = %d, want %d (empty channels must be kept within grace)", got, n)
	}
}

// Idle sweep reaps only (zero subscribers AND idle past GRACE): old empties go,
// fresh empties stay, and a non-empty channel stays regardless of age.
func TestHubIdleSweepReapsOnlyIdleEmpties(t *testing.T) {
	h := NewHub()
	ctx := context.Background()
	base := time.Now()
	h.now = func() time.Time { return base }

	for _, ch := range []string{"old-1", "old-2", "fresh", "busy"} {
		if err := h.Publish(ctx, ch, Event{Type: "progress"}); err != nil {
			t.Fatalf("publish %s failed: %v", ch, err)
		}
	}
	// busy keeps one subscriber so it is non-empty (and old, to prove
	// subscriber presence alone protects it).
	_, unsubBusy, err := h.Subscribe(ctx, "busy")
	if err != nil {
		t.Fatalf("subscribe busy failed: %v", err)
	}
	defer unsubBusy()

	// Advance past GRACE; touch only "fresh" so old-1/old-2/busy go stale.
	later := base.Add(constants.SSEIdleChannelTTL + time.Minute)
	h.now = func() time.Time { return later }
	if err := h.Publish(ctx, "fresh", Event{Type: "progress"}); err != nil {
		t.Fatalf("touch fresh failed: %v", err)
	}

	h.mu.Lock()
	h.sweepIdleLocked()
	h.mu.Unlock()

	for _, ch := range []string{"old-1", "old-2"} {
		if channelPresent(h, ch) {
			t.Errorf("idle empty channel %q must be reaped", ch)
		}
	}
	for _, ch := range []string{"fresh", "busy"} {
		if !channelPresent(h, ch) {
			t.Errorf("channel %q must survive the sweep (fresh / non-empty)", ch)
		}
	}
}

// Periodic sweep triggers on Publish: with the counter at 127 the next Publish
// (tick 128) runs a sweep even below CAP.
func TestHubPeriodicSweepOnPublish(t *testing.T) {
	h := NewHub()
	ctx := context.Background()
	base := time.Now()
	h.now = func() time.Time { return base }
	if err := h.Publish(ctx, "stale", Event{Type: "progress"}); err != nil {
		t.Fatal(err)
	}
	h.now = func() time.Time { return base.Add(constants.SSEIdleChannelTTL + time.Minute) }
	h.sweepTick = 127 // next Publish hits tick 128 → sweep
	if err := h.Publish(ctx, "trigger", Event{Type: "progress"}); err != nil {
		t.Fatal(err)
	}
	if channelPresent(h, "stale") {
		t.Fatal("stale empty channel must be reaped by the periodic publish-triggered sweep")
	}
	if !channelPresent(h, "trigger") {
		t.Fatal("just-published channel must survive")
	}
}

// CAP backstop: over SSEMaxChannels, a Publish sweeps immediately instead of
// waiting for the periodic tick.
func TestHubCapForcesImmediateSweep(t *testing.T) {
	h := NewHub()
	ctx := context.Background()
	base := time.Now()
	old := base.Add(-constants.SSEIdleChannelTTL - time.Minute)
	h.mu.Lock()
	for i := range constants.SSEMaxChannels + 1 {
		ch := fmt.Sprintf("cap-%d", i)
		h.channels[ch] = &perChannelState{
			cap:        constants.SSEBufferSize,
			buf:        make([]Event, 0, constants.SSEBufferSize),
			clients:    make(map[string]chan Event),
			lastActive: old,
		}
	}
	h.mu.Unlock()

	h.now = func() time.Time { return base }
	h.sweepTick = 1 // not a periodic tick — only the CAP path may sweep
	if err := h.Publish(ctx, "cap-fresh", Event{Type: "progress"}); err != nil {
		t.Fatal(err)
	}
	if got := channelCount(h); got != 1 {
		t.Fatalf("channel count after CAP sweep = %d, want 1 (only the fresh channel)", got)
	}
	if !channelPresent(h, "cap-fresh") {
		t.Fatal("fresh channel must survive the CAP sweep")
	}
}

// Replay survives unsubscribe: publish 3, drop the only subscriber, resubscribe
// within grace → ReplaySince(0) still returns all 3.
func TestHubReplayPreservedAcrossUnsubscribe(t *testing.T) {
	h := NewHub()
	ctx := context.Background()
	const ch = "replay-ch"
	for i := range 3 {
		if err := h.Publish(ctx, ch, Event{Type: "progress", Data: i}); err != nil {
			t.Fatal(err)
		}
	}
	_, unsub, err := h.Subscribe(ctx, ch)
	if err != nil {
		t.Fatal(err)
	}
	unsub() // stamp-and-keep: channel + buffer must stay

	if !channelPresent(h, ch) {
		t.Fatal("channel must be kept after unsubscribe (reconnect replay)")
	}
	_, resub, err := h.Subscribe(ctx, ch)
	if err != nil {
		t.Fatal(err)
	}
	defer resub()
	evs, err := h.ReplaySince(ch, 0)
	if err != nil {
		t.Fatalf("replay failed: %v", err)
	}
	if len(evs) != 3 {
		t.Fatalf("replay returned %d events, want 3", len(evs))
	}
	for i, ev := range evs {
		if ev.ID != uint64(i+1) {
			t.Errorf("event %d has ID %d, want %d", i, ev.ID, i+1)
		}
	}
}

// ReplaySince on an unknown channel must not create it.
func TestHubReplaySinceUnknownCreatesNothing(t *testing.T) {
	h := NewHub()
	if got := channelCount(h); got != 0 {
		t.Fatalf("fresh hub has %d channels, want 0", got)
	}
	evs, err := h.ReplaySince("ghost", 0)
	if err != nil {
		t.Fatalf("replay on unknown channel failed: %v", err)
	}
	if len(evs) != 0 {
		t.Fatalf("replay on unknown channel returned %d events, want 0", len(evs))
	}
	if got := channelCount(h); got != 0 {
		t.Fatalf("replay created a channel (count=%d); read paths must not grow the map", got)
	}
}
