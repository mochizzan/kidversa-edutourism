package reports

import (
	"context"
	"fmt"
	"time"
)

// placeholderNarrative is a stub generator that emits a few progressive chunks
// to demonstrate SSE streaming. Swap for a real LLM-backed generator later.
type placeholderNarrative struct{}

// NewPlaceholderNarrative builds the stub narrative generator.
func NewPlaceholderNarrative() NarrativeGenerator {
	return &placeholderNarrative{}
}

// chunks is the canned narrative content streamed for any report.
var chunks = []string{
	"Halo Orang Tua, berikut adalah cerita perkembangan putra/putri Anda hari ini.",
	"Anak menunjukkan antusiasme tinggi saat menjelajahi materi edukatif.",
	"Kemampuan berinteraksi sosial dan kolaborasi terlihat meningkat.",
	"Kami merekomendasikan misi lanjutan di rumah untuk memperkuat pembelajaran.",
}

// Generate streams chunks with a small delay to mimic token-by-token output.
func (p *placeholderNarrative) Generate(ctx context.Context, reportID string, onChunk func(seq int, chunk string)) error {
	for i, c := range chunks {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(120 * time.Millisecond):
		}
		onChunk(i+1, fmt.Sprintf("%s ", c))
	}
	return nil
}
