package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"kidversa-edutourism-backend/internal/pkg/sse"
)

// getFlusher returns the http.Flusher for an SSE response writer.
func getFlusher(w http.ResponseWriter) http.Flusher {
	return w.(http.Flusher)
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
