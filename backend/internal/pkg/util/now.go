package util

import "time"

// Now returns the current time in UTC. Use it for DATETIME(3) columns that now
// map to *time.Time domain fields (replacing the previous string-based RFC3339
// approach) so the database stores a real timestamp.
func Now() time.Time {
	return time.Now().UTC()
}

// ParseISO parses an RFC3339 (or other common) timestamp string into time.Time.
// An empty string or unparseable value yields a zero time.Time, which callers
// should treat as NULL when assigning to a *time.Time column.
func ParseISO(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.000Z07:00",
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
		"2006-01-02",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}

// FormatISO serializes a time.Time to RFC3339 with millisecond precision. A zero
// time yields an empty string so callers can omit optional/omitempty fields.
func FormatISO(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format("2006-01-02T15:04:05.000Z07:00")
}

// ParseISOOrNow parses an RFC3339 timestamp string; if empty or unparseable it
// returns the current time. Use it for required timestamp fields arriving as
// strings from the API boundary.
func ParseISOOrNow(s string) time.Time {
	if t, ok := ParseISO(s); ok {
		return t
	}
	return Now()
}
