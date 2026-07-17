package persistence

import (
	"testing"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
)

func TestSessionModelFromEntity_RFC3339ToDATE(t *testing.T) {
	// Simulates what the MySQL driver produces when reading a DATE column
	// into a string field with parseTime=true.
	e := &entity.Session{
		SessionDate: "2026-07-15T00:00:00+07:00",
	}
	m := sessionModelFromEntity(e)
	if m.SessionDate != "2026-07-15" {
		t.Errorf("sessionModelFromEntity: got %q, want %q", m.SessionDate, "2026-07-15")
	}
}

func TestSessionModelFromEntity_AlreadyDATE(t *testing.T) {
	// Value from frontend (CreateSession) is already YYYY-MM-DD.
	e := &entity.Session{
		SessionDate: "2026-07-15",
	}
	m := sessionModelFromEntity(e)
	if m.SessionDate != "2026-07-15" {
		t.Errorf("sessionModelFromEntity: got %q, want %q", m.SessionDate, "2026-07-15")
	}
}

func TestSessionModelToEntity_RFC3339ToDATE(t *testing.T) {
	// Direct DB scan (via GORM Find) populates SessionDate as RFC3339.
	m := &SessionModel{}
	m.Session = entity.Session{
		SessionDate: "2026-07-15T00:00:00+07:00",
	}
	e := m.ToEntity()
	if e.SessionDate != "2026-07-15" {
		t.Errorf("ToEntity: got %q, want %q", e.SessionDate, "2026-07-15")
	}
}

func TestSessionModelToEntity_AlreadyDATE(t *testing.T) {
	m := &SessionModel{}
	m.Session = entity.Session{
		SessionDate: "2026-07-15",
	}
	e := m.ToEntity()
	if e.SessionDate != "2026-07-15" {
		t.Errorf("ToEntity: got %q, want %q", e.SessionDate, "2026-07-15")
	}
}

func TestSessionModelRoundTrip(t *testing.T) {
	// Simulates the full cycle: DB read (RFC3339) → ToEntity → modify status →
	// sessionModelFromEntity → DB write (DATE).
	simulatedDBScan := "2026-07-15T00:00:00+07:00"
	entity := &entity.Session{SessionDate: simulatedDBScan}

	// Read from DB via ToEntity
	model := &SessionModel{}
	model.Session = *entity
	readBack := model.ToEntity()
	if readBack.SessionDate != "2026-07-15" {
		t.Fatalf("ToEntity round-trip: got %q, want %q", readBack.SessionDate, "2026-07-15")
	}

	// Write back via sessionModelFromEntity
	written := sessionModelFromEntity(readBack)
	if written.SessionDate != "2026-07-15" {
		t.Fatalf("sessionModelFromEntity round-trip: got %q, want %q", written.SessionDate, "2026-07-15")
	}
}

func TestSessionDateLayoutConstant(t *testing.T) {
	// Verify the constant matches Go's date layout convention.
	today := time.Date(2026, 7, 15, 0, 0, 0, 0, time.Local)
	got := today.Format(sessionDateLayout)
	if got != "2026-07-15" {
		t.Errorf("sessionDateLayout format: got %q, want %q", got, "2026-07-15")
	}
}
