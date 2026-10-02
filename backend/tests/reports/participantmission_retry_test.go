package reports_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// deadlockErr is the real MySQL/MariaDB error 1213 text the driver surfaces
// when two transactions deadlock — the exact failure observed during
// concurrent mission_persist (delete next-key locks vs. insert intention
// locks on the reports row).
var deadlockErr = errors.New("Error 1213 (40001): Deadlock found when trying to get lock; try restarting transaction")

// retryReportRepo satisfies the repo's report-ownership assertion without SQL
// (GetByID returns the report unconditionally); unused methods panic via the
// embedded nil interface.
type retryReportRepo struct {
	repository.ReportRepository
}

func (retryReportRepo) GetByID(_ context.Context, id, _ string) (*entity.Report, error) {
	return &entity.Report{BaseModel: entity.BaseModel{ID: id}}, nil
}

// newRetryMockRepo builds the real GormParticipantMissionRepository over a
// sqlmock DB (frame/session test pattern) so a single ReplaceByReport call's
// transaction attempts can be scripted.
func newRetryMockRepo(t *testing.T) (repository.ParticipantMissionRepository, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	db, err := gorm.Open(mysql.New(mysql.Config{
		Conn:                      sqlDB,
		SkipInitializeWithVersion: true,
	}), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open gorm: %v", err)
	}
	return persistence.NewParticipantMissionRepository(db, retryReportRepo{}), mock
}

var retryItems = []entity.ParticipantMission{
	{ReportID: "r-1", MissionBankID: "m-1", IsCompleted: true},
}

// TestReplaceByReportRetriesDeadlockThenSucceeds: the first transaction
// attempt hits MySQL error 1213 on the delete and rolls back; the retry runs
// the SAME delete+insert transaction again and succeeds — the call returns
// nil and every BEGIN/DELETE/INSERT/COMMIT/ROLLBACK expectation is consumed
// (exactly two attempts, no more).
func TestReplaceByReportRetriesDeadlockThenSucceeds(t *testing.T) {
	repo, mock := newRetryMockRepo(t)

	// Attempt 1: begin → delete deadlocks → rollback.
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM `participant_missions` WHERE report_id").
		WillReturnError(deadlockErr)
	mock.ExpectRollback()
	// Attempt 2: begin → delete → insert → commit.
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM `participant_missions` WHERE report_id").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("INSERT INTO `participant_missions`").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	if err := repo.ReplaceByReport(context.Background(), "tenant-1", "r-1", retryItems); err != nil {
		t.Fatalf("ReplaceByReport must succeed after a deadlock retry, got: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet sqlmock expectations (retry must re-run the whole transaction): %v", err)
	}
}

// TestReplaceByReportPersistentDeadlockSurfaces: when EVERY attempt deadlocks
// the bounded retry gives up and the error surfaces with the original
// apperrors wrapping (internal_error / 500, message still the 1213 cause) —
// it is never swallowed. Exactly deadlockRetryAttempts (4) attempts run: more
// would fail ExpectationsWereMet, fewer would leave expectations unmet.
func TestReplaceByReportPersistentDeadlockSurfaces(t *testing.T) {
	repo, mock := newRetryMockRepo(t)

	const attempts = 4 // deadlockRetryAttempts in the persistence package
	for range attempts {
		mock.ExpectBegin()
		mock.ExpectExec("DELETE FROM `participant_missions` WHERE report_id").
			WillReturnError(deadlockErr)
		mock.ExpectRollback()
	}

	err := repo.ReplaceByReport(context.Background(), "tenant-1", "r-1", retryItems)
	if err == nil {
		t.Fatal("a permanently deadlocking transaction must surface an error")
	}
	if status, code, ok := apperrors.AsAppError(err); !ok || status != 500 || code != "internal_error" {
		t.Errorf("error = (status=%d code=%q ok=%v), want the unchanged internal_error/500 wrapping", status, code, ok)
	}
	if !strings.Contains(err.Error(), "1213") || !strings.Contains(err.Error(), "Deadlock") {
		t.Errorf("error message = %q, want the original 1213 cause preserved", err.Error())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet sqlmock expectations (want exactly %d attempts): %v", attempts, err)
	}
}

// TestReplaceByReportNonDeadlockNotRetried: a NON-deadlock SQL error is not a
// transient condition — it returns immediately after a single attempt (no
// retry loop on unrelated failures).
func TestReplaceByReportNonDeadlockNotRetried(t *testing.T) {
	repo, mock := newRetryMockRepo(t)

	schemaErr := errors.New("Error 1054 (42S22): Unknown column 'bogus' in 'field list'")
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM `participant_missions` WHERE report_id").
		WillReturnError(schemaErr)
	mock.ExpectRollback()

	start := time.Now()
	err := repo.ReplaceByReport(context.Background(), "tenant-1", "r-1", retryItems)
	if err == nil {
		t.Fatal("a failing transaction must surface an error")
	}
	if !strings.Contains(err.Error(), "1054") {
		t.Errorf("error = %q, want the original 1054 cause preserved", err.Error())
	}
	if elapsed := time.Since(start); elapsed >= 50*time.Millisecond {
		t.Errorf("non-deadlock errors must not back off/retry, took %v", elapsed)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet sqlmock expectations (want exactly 1 attempt): %v", err)
	}
}
