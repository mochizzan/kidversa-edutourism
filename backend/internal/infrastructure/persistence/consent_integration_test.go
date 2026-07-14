package persistence

import (
	"context"
	"testing"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// TestB2B13ConsentScoping verifies consent rows are isolated per session/scope
// (plan B2 tenant-scoping + B13 getBySession). A ListBySession call must return
// only the rows for the requested session, never cross into another session's rows.
func TestB2B13ConsentScoping(t *testing.T) {
	db := openTestDB(t)
	tenant := seedTenant(db)
	user := seedUser(db, tenant)
	program := seedProgram(db, tenant)
	pid := seedParticipant(db, tenant)
	sidA := seedSession(db, tenant, program, user)
	sidB := seedSession(db, tenant, program, user)
	ctx := context.Background()

	repo := NewConsentRepository(db, 24*time.Hour)
	mk := func(sid string) {
		log := &entity.ConsentLog{
			ParticipantID: pid,
			SessionID:     sid,
			ConsentType:   entity.ConsentPhoto,
			Value:         true,
			SentAt:        "2026-07-20T10:00:00Z",
		}
		if err := repo.Create(ctx, log); err != nil {
			t.Fatalf("create consent: %v", err)
		}
	}
	mk(sidA)
	mk(sidA)
	mk(sidB)

	rowsA, err := repo.ListBySession(ctx, sidA)
	if err != nil {
		t.Fatalf("ListBySession A: %v", err)
	}
	if len(rowsA) != 2 {
		t.Fatalf("expected 2 consent rows for session A, got %d", len(rowsA))
	}
	for _, r := range rowsA {
		if r.SessionID != sidA {
			t.Fatalf("leaked row from another session: %+v", r)
		}
	}

	rowsB, err := repo.ListBySession(ctx, sidB)
	if err != nil {
		t.Fatalf("ListBySession B: %v", err)
	}
	if len(rowsB) != 1 {
		t.Fatalf("expected 1 consent row for session B, got %d", len(rowsB))
	}
}

// TestB10ConsentTokenRoundTrip verifies SendRequest issues a token and RespondByToken
// records the decision (plan B10), while a second attempt is rejected (SC6 replay).
func TestB10ConsentTokenRoundTrip(t *testing.T) {
	db := openTestDB(t)
	tenant := seedTenant(db)
	user := seedUser(db, tenant)
	program := seedProgram(db, tenant)
	pid := seedParticipant(db, tenant)
	sid := seedSession(db, tenant, program, user)
	ctx := context.Background()

	repo := NewConsentRepository(db, 24*time.Hour)
	token, err := repo.SendRequest(ctx, pid, sid, entity.ConsentPhoto)
	if err != nil {
		t.Fatalf("SendRequest: %v", err)
	}
	if len(token) != 64 {
		t.Fatalf("expected 64-char hex token, got len=%d", len(token))
	}

	if err := repo.RespondByToken(ctx, token, true, "127.0.0.1", "ua"); err != nil {
		t.Fatalf("RespondByToken: %v", err)
	}
	// Replay must be rejected.
	if err := repo.RespondByToken(ctx, token, true, "127.0.0.1", "ua"); err == nil {
		t.Fatalf("expected replay of consumed token to be rejected")
	}

	// The recorded value must be readable.
	val, err := repo.GetValue(ctx, pid, sid, entity.ConsentPhoto)
	if err != nil {
		t.Fatalf("GetValue: %v", err)
	}
	if !val {
		t.Fatalf("expected consent value=true after RespondByToken")
	}
}
