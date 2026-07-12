// Package util provides small shared helpers used across use cases.
package util

import "time"

// NowISO returns the current time formatted as RFC3339 with millisecond precision,
// suitable for the DATETIME(3) columns used throughout the schema.
func NowISO() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z07:00")
}
