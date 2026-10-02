package persistence

import (
	"context"
	"strings"
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/pkg/util"
)

// paginate applies consistent ordering and page-slice math (Offset/Limit) to a
// GORM query. page/limit use the conventional 1-based page and (page-1)*limit
// offset; callers run .Count(&total) on q before paginate(q, ...) for the slice.
func paginate(q *gorm.DB, page, limit int, order string) *gorm.DB {
	return q.Order(order).Offset((page - 1) * limit).Limit(limit)
}

// scopeByTenant restricts q to rows whose owning session belongs to tenantID via
// the session_id IN (SELECT id FROM sessions WHERE tenant_id = ?) clause. When
// tenantID is empty the clause is skipped (tenant-less SUPER_ADMIN scope).
func scopeByTenant(q *gorm.DB, tenantID string) *gorm.DB {
	if tenantID != "" {
		q = q.Where("session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)", tenantID)
	}
	return q
}

// InTx runs fn inside a DB transaction, passing the transactional *gorm.DB.
// It rolls back on a non-nil error from fn and commits otherwise.
func InTx(ctx context.Context, db *gorm.DB, fn func(tx *gorm.DB) error) error {
	return db.WithContext(ctx).Transaction(fn)
}

// newUUID returns a random UUID v4 string (used for CHAR(36) primary keys).
// Package-local shorthand for the shared util.NewUUID, kept because the model
// files call it on nearly every Create.
func newUUID() string {
	return util.NewUUID()
}

// isDuplicate reports whether err is a MySQL/MariaDB duplicate-entry (unique constraint) error.
func isDuplicate(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate") || strings.Contains(msg, "1062") || strings.Contains(msg, "er_dup_entry")
}

// isSchemaDrift reports whether err is a MySQL/MariaDB schema-drift error
// (e.g. unknown column after a migration was skipped).
func isSchemaDrift(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "1054") || strings.Contains(msg, "unknown column")
}

// deadlockRetryAttempts bounds the transaction deadlock retry: one initial
// attempt plus the retries below. Enough to ride out the short lock-order
// inversions of concurrent generate runs without ever serializing them.
const deadlockRetryAttempts = 4

// isDeadlock reports whether err is a MySQL/MariaDB deadlock (1213) or a
// lock-wait timeout (1205) — transient errors a transaction can succeed on
// after rolling back and starting over. Like its isDuplicate/isSchemaDrift
// siblings it matches on the message, so causes wrapped by apperrors (whose
// Error() returns the wrapped cause) still match.
func isDeadlock(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "deadlock") ||
		strings.Contains(msg, "error 1213") ||
		strings.Contains(msg, "lock wait timeout") ||
		strings.Contains(msg, "error 1205")
}

// withDeadlockRetry runs fn up to deadlockRetryAttempts times, retrying only
// when the attempt failed with a deadlock/lock-wait error. fn must own a
// complete transaction per attempt (BEGIN/COMMIT/ROLLBACK — gorm's
// Transaction), so every retry starts from a clean rollback and the work
// inside one attempt stays atomic. A non-deadlock error returns immediately;
// the final error after exhausting the attempts is returned unchanged, never
// swallowed. Between attempts it backs off (respecting ctx cancellation) so
// the competing transaction holding the locks can finish.
func withDeadlockRetry(ctx context.Context, fn func() error) error {
	var err error
	for attempt := range deadlockRetryAttempts {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				// Caller is gone: surface the last real (deadlock) error
				// instead of hiding it behind the context error.
				return err
			case <-time.After(time.Duration(attempt) * 50 * time.Millisecond):
			}
		}
		if err = fn(); err == nil || !isDeadlock(err) {
			return err
		}
	}
	return err
}
