package persistence

import (
	"context"
	"strings"

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
