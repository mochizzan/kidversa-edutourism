// Package constants holds shared backend tuning values that were previously
// scattered as raw literals across persistence, use cases, middleware, and
// transport code. Centralizing them gives one source of truth and keeps
// behavior identical to the prior hardcoded values.
package constants

import "time"

// DefaultPageLimit is the fallback page size for list endpoints.
const DefaultPageLimit = 25

// MaxPageLimit caps the page size a client may request on list endpoints.
const MaxPageLimit = 100

// MaxSessionReports caps the number of reports fetched per session during
// batch narrative generation (reports.go).
const MaxSessionReports = 1000

// ReportNarrativeConcurrency is the size of the semaphore bounding concurrent
// AI narrative generation per session (reports.go).
const ReportNarrativeConcurrency = 3

// DBPingTimeout bounds the context for connection liveness checks
// (Ping / HealthPing / keepalive probes in persistence/db.go).
const DBPingTimeout = 3 * time.Second

// DBConnMaxIdleTime closes idle pooled connections before MariaDB's
// wait_timeout can drop them (persistence/db.go).
const DBConnMaxIdleTime = 5 * time.Minute

// RateLimitEvictionInterval is how often idle per-IP token buckets are
// evicted from the in-memory rate limiter (middleware/ratelimit.go).
const RateLimitEvictionInterval = 5 * time.Minute

// WhatsAppRequestTimeout bounds the HTTP client used to call the OpenWA
// gateway (messaging/whatsapp.go).
const WhatsAppRequestTimeout = 10 * time.Second

// WhatsAppSendTextPath is the OpenWA send-text endpoint path, formatted with
// the session id (messaging/whatsapp.go).
const WhatsAppSendTextPath = "/api/sessions/%s/messages/send-text"

// SSEBufferSize is the per-channel ring-buffer capacity (pkg/sse/hub.go).
const SSEBufferSize = 64

// SSEChannelBuffer is the per-subscriber unbuffered-event channel capacity
// (pkg/sse/hub.go).
const SSEChannelBuffer = 256
