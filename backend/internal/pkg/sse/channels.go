package sse

// Channel naming conventions for SSE topics.

// LiveChannel returns the SSE channel for a session's live progress + timeline.
func LiveChannel(sessionID string) string { return "live:" + sessionID }

// NotifChannel returns the SSE channel for a user's notifications.
func NotifChannel(userID string) string { return "notif:" + userID }

// NarrativeChannel returns the SSE channel streaming a report's AI narrative.
func NarrativeChannel(reportID string) string { return "report:" + reportID + ":narrative" }

// ConsentChannel returns the SSE channel streaming WhatsApp consent-delivery
// batch progress for a given batch ID.
func ConsentChannel(batchID string) string { return "consent:" + batchID }
