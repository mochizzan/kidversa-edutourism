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

// getFlusher returns the http.Flusher for an SSE response writer.
func getFlusher(w http.ResponseWriter) http.Flusher {
	return w.(http.Flusher)
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
	w.WriteHeader(http.StatusOK)
	f := getFlusher(w)
	f.Flush()

	if initial != nil {
		writeSSE(w, f, *initial)
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
			writeSSE(w, f, ev)
		case <-keep:
			writeKeepalive(w, f)
		}
	}
}

// writeSSE serializes one SSE event and flushes it to the client.
func writeSSE(w http.ResponseWriter, f http.Flusher, ev sse.Event) {
	b, err := json.Marshal(ev.Data)
	if err != nil {
		return
	}
	if ev.ID != 0 {
		fmt.Fprintf(w, "id: %d\n", ev.ID)
	}
	if ev.Type != "" {
		fmt.Fprintf(w, "event: %s\n", ev.Type)
	}
	fmt.Fprintf(w, "data: %s\n\n", b)
	f.Flush()
}

// writeKeepalive emits an SSE comment frame so proxies don't drop an idle stream.
func writeKeepalive(w http.ResponseWriter, f http.Flusher) {
	fmt.Fprintf(w, ": keepalive\n\n")
	f.Flush()
}
