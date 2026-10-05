package session_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// TestSessionRepository_GetSessionByIDForUpdate_TakesRowLock proves the read
// that serializes CancelSession against the assessment write (audit #12/#14)
// emits SELECT ... FOR UPDATE on the session row, inside a transaction.
func TestSessionRepository_GetSessionByIDForUpdate_TakesRowLock(t *testing.T) {
	repo, mock := newMockRepo(t)
	ctx := context.Background()

	now := time.Now()
	mock.ExpectBegin()
	// GORM's First binds id AND the LIMIT ? placeholder (1).
	mock.ExpectQuery("SELECT .*FROM `sessions` WHERE id = \\? .*FOR UPDATE").
		WithArgs("s1", 1).
		WillReturnRows(sqlmock.NewRows(sessionColumns()).
			AddRow("s1", "t1", "p1", "Program A", "Session Satu", "2026-01-05", nil, nil, "Lab", "CANCELLED", "", nil, now, now, nil))
	mock.ExpectCommit()

	var got *entity.Session
	err := repo.Transaction(ctx, func(tx repository.SessionRepository) error {
		var terr error
		got, terr = tx.GetSessionByIDForUpdate(ctx, "s1", "")
		return terr
	})
	if err != nil {
		t.Fatalf("locked read inside transaction failed: %v", err)
	}
	if got == nil || got.Status != entity.SessionCancelled {
		t.Fatalf("got %+v, want the CANCELLED session row", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// TestSessionRepository_CountActiveGroupMembers_PointerOnly pins the capacity
// count (audit #10): a plain COUNT on the CURRENT pointer columns — no
// participant_session_memberships union, no history subquery.
func TestSessionRepository_CountActiveGroupMembers_PointerOnly(t *testing.T) {
	repo, mock := newMockRepo(t)
	ctx := context.Background()

	mock.ExpectQuery("SELECT count\\(\\*\\).*FROM `participants` WHERE session_id = \\? AND group_id = \\?").
		WithArgs("sess-1", "grp-1").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))

	n, err := repo.CountActiveGroupMembers(ctx, "sess-1", "grp-1")
	if err != nil {
		t.Fatalf("count active members: %v", err)
	}
	if n != 3 {
		t.Errorf("count = %d, want 3", n)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// Empty sessionID falls back to the group pointer only (contract used by the
// import path when it runs without a session scope).
func TestSessionRepository_CountActiveGroupMembers_GroupOnlyFallback(t *testing.T) {
	repo, mock := newMockRepo(t)
	ctx := context.Background()

	mock.ExpectQuery("SELECT count\\(\\*\\).*FROM `participants` WHERE group_id = \\?").
		WithArgs("grp-1").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	n, err := repo.CountActiveGroupMembers(ctx, "", "grp-1")
	if err != nil {
		t.Fatalf("count active members: %v", err)
	}
	if n != 0 {
		t.Errorf("count = %d, want 0", n)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}
