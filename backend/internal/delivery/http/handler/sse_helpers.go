package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v5"

	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

// flushWriter combines a response writer with a controller that can flush
// and report flush errors. It lets writeSSE/writeKeepalive detect a dropped
// client at the exact moment a frame is pushed.
type flushWriter struct {
	w  http.ResponseWriter
	rc *http.ResponseController
}

func newFlushWriter(w http.ResponseWriter) *flushWriter {
	return &flushWriter{
		w:  w,
		rc: http.NewResponseController(w),
	}
}

func (fw *flushWriter) Flush() error {
	return fw.rc.Flush()
}

// streamSSE subscribes to ch on hub and streams events to the client until the
// request context is cancelled. It writes the SSE headers, an optional initial
// snapshot event, then live events with periodic keepalives. The report stream
// previously omitted keepalives — this shared helper includes them for all three
// SSE endpoints (live, notifications, report narrative).
func streamSSE(c *echo.Context, hub *sse.Hub, ch string, initial *sse.Event, keepaliveSec int) error {
	ctx := (*c).Request().Context()

	ec, unsub, err := hub.Subscribe(ctx, ch)
	if err != nil {
		return appresp.Fail(c, http.StatusInternalServerError, "internal_error")
	}
	defer unsub()

	w := (*c).Response().(http.ResponseWriter)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fw := newFlushWriter(w)
	if err := fw.Flush(); err != nil {
		return nil
	}

	if initial != nil {
		if err := writeSSE(fw, *initial); err != nil {
			return nil
		}
	}

	// Replay any events already buffered for this channel so a client that
	// connects after publishing started does not miss early events (small-batch
	// races). A cursor of 0 replays the whole buffer; ReplaySince only returns
	// ReplayGap for a once-valid cursor that has since been evicted, in which
	// case we simply start live.
	// Errors are per-attempt and terminal: replaying a stale error event from a
	// previous generation makes a later successful attempt look failed (e.g. a
	// prior tenant_required surfaces on every subsequent open). Never replay
	// error events — live errors are still delivered in real time below.
	if replay, err := hub.ReplaySince(ch, 0); err == nil {
		for _, ev := range replay {
			if ev.Type == "error" {
				continue
			}
			if err := writeSSE(fw, ev); err != nil {
				return nil
			}
		}
	}

	var keep <-chan time.Time
	if keepaliveSec > 0 {
		t := time.NewTicker(time.Duration(keepaliveSec) * time.Second)
		defer t.Stop()
		keep = t.C
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case ev, ok := <-ec:
			if !ok {
				return nil
			}
			if err := writeSSE(fw, ev); err != nil {
				return nil
			}
		case <-keep:
			if err := writeKeepalive(fw); err != nil {
				return nil
			}
		}
	}
}

// writeSSE serializes one SSE event and flushes it to the client.
// It returns any write/flush error so the caller can stop the stream when
// the client has disconnected.
func writeSSE(fw *flushWriter, ev sse.Event) error {
	b, err := json.Marshal(ev.Data)
	if err != nil {
		return err
	}
	if ev.ID != 0 {
		if _, err := fmt.Fprintf(fw.w, "id: %d\n", ev.ID); err != nil {
			return err
		}
	}
	if ev.Type != "" {
		if _, err := fmt.Fprintf(fw.w, "event: %s\n", ev.Type); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(fw.w, "data: %s\n\n", b); err != nil {
		return err
	}
	return fw.Flush()
}

// writeKeepalive emits an SSE comment frame so proxies don't drop an idle stream.
// It returns any write/flush error so the caller can stop the stream when
// the client has disconnected.
func writeKeepalive(fw *flushWriter) error {
	if _, err := fmt.Fprintf(fw.w, ": keepalive\n\n"); err != nil {
		return err
	}
	return fw.Flush()
}
