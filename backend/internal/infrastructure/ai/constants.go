package ai

import "time"

// OpenRouterRequestTimeout is the per-request timeout for OpenRouter HTTP calls
// and the context deadline used when generating a narrative for a single report.
// Both the AI client and the reports usecase share this value so transport
// timing stays consistent.
const OpenRouterRequestTimeout = 90 * time.Second
