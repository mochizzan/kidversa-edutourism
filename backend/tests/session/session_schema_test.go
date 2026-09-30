package session_test

import (
	"sync"
	"testing"

	"gorm.io/gorm/schema"

	"kidversa-edutourism-backend/internal/infrastructure/persistence"
)

// TestSessionModelSchema_HasNoPhantomColumns pins GORM's column mapping for
// SessionModel to the real `sessions` DDL (migrations/000001_init_schema.up.sql).
//
// The sessions-list display fields (Topics, ActivityCount) carry `gorm:"-"` so
// they must never appear as columns; any other drift — an entity field without
// a matching DB column — would break INSERT/UPDATE with "Unknown column" at
// runtime (the classic embedded-entity phantom-column pitfall). This test is
// pure schema introspection: no database is opened.
func TestSessionModelSchema_HasNoPhantomColumns(t *testing.T) {
	parsed, err := schema.Parse(&persistence.SessionModel{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatalf("schema.Parse(SessionModel): %v", err)
	}

	// Exact column set of CREATE TABLE `sessions` in 000001_init_schema.up.sql.
	want := map[string]bool{
		"id": true, "tenant_id": true, "program_id": true, "program_name": true,
		"name": true, "session_date": true, "start_time": true, "end_time": true,
		"location": true, "status": true, "notes": true, "created_by": true,
		"created_at": true, "updated_at": true, "deleted_at": true,
	}

	got := map[string]bool{}
	for _, col := range parsed.DBNames {
		got[col] = true
	}

	for col := range want {
		if !got[col] {
			t.Errorf("sessions DDL column %q is not mapped by SessionModel", col)
		}
	}
	for col := range got {
		if !want[col] {
			t.Errorf("phantom column: SessionModel maps %q but the sessions table has no such column", col)
		}
	}

	// Explicit guards for the list-only display fields added to entity.Session.
	for _, col := range []string{"topics", "activity_count"} {
		if got[col] {
			t.Errorf("display field %q leaked into the GORM schema: gorm:\"-\" tag is missing or ineffective", col)
		}
	}
}
