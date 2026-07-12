package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/pkg/sse"
)

// NarrativeStream handles GET /api/reports/:id/narrative-stream (SSE).
// Streams narrative chunks for the report's SSE channel to the parent browser.
func (h *ReportHandler) NarrativeStream(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	ec, unsub, err := h.uc.Hub().Subscribe(ctx, sse.NarrativeChannel(id))
	if err != nil {
		return err
	}
	defer unsub()
	w := (*c).Response().(http.ResponseWriter)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher := w.(http.Flusher)
	flusher.Flush()
	for {
		select {
		case <-ctx.Done():
			return nil
		case ev, ok := <-ec:
			if !ok {
				return nil
			}
			writeSSE(w, flusher, ev)
		}
	}
}
