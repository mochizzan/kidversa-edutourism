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

// reorderByIDs renumbers orderCol to 1..n for the given ids in a single
// CASE WHEN batch update (instead of one UPDATE per id). model selects the
// table; keyCol is the column matched against ids (e.g. "id" or "content_id").
// Rows whose keyCol is in ids get their 1-based position; all others are left
// untouched (the WHERE restricts the update set to ids).
func reorderByIDs(tx *gorm.DB, model interface{}, ids []string, keyCol, orderCol string) error {
	if len(ids) == 0 {
		return nil
	}
	var b strings.Builder
	args := make([]interface{}, 0, len(ids)*2)
	b.WriteString("CASE")
	for i, id := range ids {
		b.WriteString(" WHEN " + keyCol + " = ? THEN ?")
		args = append(args, id, i+1)
	}
	b.WriteString(" ELSE " + orderCol + " END")
	return tx.Model(model).Where(keyCol+" IN ?", ids).
		Updates(map[string]interface{}{orderCol: gorm.Expr(b.String(), args...)}).Error
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
