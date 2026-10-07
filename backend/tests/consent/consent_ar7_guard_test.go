package consent_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
)

// AR-7 (F-A-009b): the batch worker's post-send audit write must never regress
// answered→unanswered. An answered row (responded_at != NULL, granted) goes
// through SendConsentRequest → the row is left intact: no UPDATE to
// consent_logs, no participants.consent_photo projection clear. The single
// SELECT expectation below is exhaustive — any write attempt fails the call
// (unexpected sqlmock Exec) or leaves unmet/mismatched expectations.
func TestConsentSendRequest_AnsweredGranted_RowUnchanged(t *testing.T) {
	db, mock := newConsentMockDB(t)
	repo := persistence.NewConsentRepository(db, 0)

	answeredAt := time.Now().UTC().Add(-time.Minute)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT.*consent_logs").
		WillReturnRows(sqlmock.NewRows([]string{"id", "participant_id", "session_id", "consent_type", "value", "sent_at", "responded_at"}).
			AddRow("log-1", "p-1", "s-1", "PHOTO", true, time.Now().UTC().Add(-time.Hour), answeredAt))
	mock.ExpectCommit()

	if err := repo.SendConsentRequest(context.Background(), "p-1", "s-1", entity.ConsentPhoto); err != nil {
		t.Fatalf("answered row must be preserved without error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations (a write was issued or the read missed): %v", err)
	}
}

// AR-7: denied rows are answered too (responded_at set, value=false) and must
// likewise survive the audit write untouched.
func TestConsentSendRequest_AnsweredDenied_RowUnchanged(t *testing.T) {
	db, mock := newConsentMockDB(t)
	repo := persistence.NewConsentRepository(db, 0)

	answeredAt := time.Now().UTC().Add(-time.Minute)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT.*consent_logs").
		WillReturnRows(sqlmock.NewRows([]string{"id", "participant_id", "session_id", "consent_type", "value", "sent_at", "responded_at"}).
			AddRow("log-1", "p-1", "s-1", "PHOTO", false, time.Now().UTC().Add(-time.Hour), answeredAt))
	mock.ExpectCommit()

	if err := repo.SendConsentRequest(context.Background(), "p-1", "s-1", entity.ConsentPhoto); err != nil {
		t.Fatalf("denied row must be preserved without error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations (a write was issued or the read missed): %v", err)
	}
}

// AR-7 re-screen: a grant landing mid-batch — after the worker's eligibility
// snapshot, between this write's initial read (still unanswered, responded_at
// NULL) and the audit UPDATE — is honored, not clobbered. The re-screen sees
// the grant and the write becomes a no-op: no UPDATE, no projection clear.
func TestConsentSendRequest_GrantDuringBatch_Preserved(t *testing.T) {
	db, mock := newConsentMockDB(t)
	repo := persistence.NewConsentRepository(db, 0)

	// Initial read: row still unanswered (no responded_at column → NULL).
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT.*consent_logs").
		WillReturnRows(sqlmock.NewRows([]string{"id", "participant_id", "session_id", "consent_type", "value"}).
			AddRow("log-1", "p-1", "s-1", "PHOTO", false))
	// Re-screen (GetConsentValue): the parent's grant has landed meanwhile.
	mock.ExpectQuery("SELECT.*consent_logs").
		WillReturnRows(sqlmock.NewRows([]string{"id", "participant_id", "session_id", "consent_type", "value"}).
			AddRow("log-1", "p-1", "s-1", "PHOTO", true))
	mock.ExpectCommit()

	if err := repo.SendConsentRequest(context.Background(), "p-1", "s-1", entity.ConsentPhoto); err != nil {
		t.Fatalf("mid-batch grant must be preserved without error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations (a write slipped through or reads mis-ordered): %v", err)
	}
}

// AR-7 hardening: the audit write's initial read must take a SELECT ...
// FOR UPDATE row lock inside an explicit transaction. sqlmock with the
// regexp matcher sees the generated SQL: the lock clause must be present,
// and BEGIN must precede the read. If a future refactor drops the lock or
// the tx, this test fails on the unmatched query/expectation order.
func TestConsentSendRequest_InitialReadLocksRowInTx(t *testing.T) {
	db, mock := newConsentMockDB(t)
	repo := persistence.NewConsentRepository(db, 0)

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT.*consent_logs.*FOR UPDATE").
		WillReturnRows(sqlmock.NewRows([]string{"id", "participant_id", "session_id", "consent_type", "value"}).
			AddRow("log-1", "p-1", "s-1", "PHOTO", false))
	// Re-screen inside the same tx: still unanswered → write proceeds.
	mock.ExpectQuery("SELECT.*consent_logs").
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectExec("UPDATE `consent_logs`").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE `participants`").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := repo.SendConsentRequest(context.Background(), "p-1", "s-1", entity.ConsentPhoto); err != nil {
		t.Fatalf("unanswered write must succeed, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations (lock clause or tx boundary missing?): %v", err)
	}
}

// AR-7 hardening: a grant that commits between the worker's eligibility
// snapshot and our locked read is serialized by the row lock — our read
// (blocked until the grant commits) observes responded_at and the audit
// write becomes a no-op. Simulated here by the locked read returning the
// already-answered row: no UPDATE, no projection clear, tx commits clean.
func TestConsentSendRequest_SerializedGrantWins(t *testing.T) {
	db, mock := newConsentMockDB(t)
	repo := persistence.NewConsentRepository(db, 0)

	answeredAt := time.Now().UTC()
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT.*consent_logs.*FOR UPDATE").
		WillReturnRows(sqlmock.NewRows([]string{"id", "participant_id", "session_id", "consent_type", "value", "sent_at", "responded_at"}).
			AddRow("log-1", "p-1", "s-1", "PHOTO", true, time.Now().UTC().Add(-time.Hour), answeredAt))
	mock.ExpectCommit()

	if err := repo.SendConsentRequest(context.Background(), "p-1", "s-1", entity.ConsentPhoto); err != nil {
		t.Fatalf("serialized grant must be preserved without error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations (a write slipped through the lock?): %v", err)
	}
}
