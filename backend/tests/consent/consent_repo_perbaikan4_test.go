package consent_test

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

func newConsentMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	db, err := gorm.Open(mysql.New(mysql.Config{
		Conn:                      sqlDB,
		SkipInitializeWithVersion: true,
	}), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open gorm: %v", err)
	}
	return db, mock
}

// Miss → (false, nil): no error, no log noise.
func TestConsentGetConsentValue_Miss_FalseNil(t *testing.T) {
	db, mock := newConsentMockDB(t)
	repo := persistence.NewConsentRepository(db, 0)

	mock.ExpectQuery("SELECT.*consent_logs").
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	v, err := repo.GetConsentValue(context.Background(), "p-1", "s-1", entity.ConsentPhoto)
	if err != nil {
		t.Fatalf("expected nil error on miss, got %v", err)
	}
	if v {
		t.Error("expected false on miss")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// DB failure → 500 internal_error (never false,nil).
func TestConsentGetConsentValue_DBFailure_Internal(t *testing.T) {
	db, mock := newConsentMockDB(t)
	repo := persistence.NewConsentRepository(db, 0)

	mock.ExpectQuery("SELECT.*consent_logs").
		WillReturnError(errors.New("connection refused"))

	if _, err := repo.GetConsentValue(context.Background(), "p-1", "s-1", entity.ConsentPhoto); err == nil {
		t.Fatal("expected error, got nil")
	} else if st, code, ok := apperrors.AsAppError(err); !ok || st != 500 || code != "internal_error" {
		t.Errorf("expected 500/internal_error, got status=%d code=%q ok=%v err=%v", st, code, ok, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Create error on the upsert path → explicit 500 internal_error.
func TestConsentSendRequest_CreateError_Internal(t *testing.T) {
	db, mock := newConsentMockDB(t)
	repo := persistence.NewConsentRepository(db, 0)

	mock.ExpectQuery("SELECT.*consent_logs").
		WillReturnRows(sqlmock.NewRows([]string{"id"})) // miss → create path
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `consent_logs`").WithArgs(
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
	).WillReturnError(errors.New("connection refused"))
	mock.ExpectRollback()

	if err := repo.SendConsentRequest(context.Background(), "p-1", "s-1", entity.ConsentPhoto); err == nil {
		t.Fatal("expected error, got nil")
	} else if st, code, ok := apperrors.AsAppError(err); !ok || st != 500 || code != "internal_error" {
		t.Errorf("expected 500/internal_error, got status=%d code=%q ok=%v err=%v", st, code, ok, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Projection pairing: whenever SendConsentRequest leaves the log row
// UNANSWERED (re-send clears responded_at/value, fresh send creates it that
// way), the denormalized participants.consent_photo/consent_at projection must
// be cleared in the SAME flow — the flag never claims granted consent while the
// log row is absent/unanswered. The combined token pair is deliberately NOT
// touched (SendSingle mints the fresh token before this audit write).
func TestConsentSendRequest_ClearsParticipantProjection(t *testing.T) {
	expectProjectionClear := func(mock sqlmock.Sqlmock) {
		mock.ExpectBegin()
		mock.ExpectExec("UPDATE `participants`").WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectCommit()
	}

	t.Run("re_send_resets_log_then_clears_projection", func(t *testing.T) {
		db, mock := newConsentMockDB(t)
		repo := persistence.NewConsentRepository(db, 0)

		// Existing (already granted) row → reset: sent_at=now, responded_at
		// NULL, value false…
		mock.ExpectQuery("SELECT.*consent_logs").
			WillReturnRows(sqlmock.NewRows([]string{"id", "participant_id", "session_id", "consent_type", "value"}).
				AddRow("log-1", "p-1", "s-1", "PHOTO", true))
		mock.ExpectBegin()
		mock.ExpectExec("UPDATE `consent_logs`").WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectCommit()
		// …and the paired projection clear on the participant row.
		expectProjectionClear(mock)

		if err := repo.SendConsentRequest(context.Background(), "p-1", "s-1", entity.ConsentPhoto); err != nil {
			t.Fatalf("re-send must succeed, got %v", err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet expectations: %v", err)
		}
	})

	t.Run("fresh_row_clears_projection", func(t *testing.T) {
		db, mock := newConsentMockDB(t)
		repo := persistence.NewConsentRepository(db, 0)

		// Miss → create path, then the paired projection clear.
		mock.ExpectQuery("SELECT.*consent_logs").
			WillReturnRows(sqlmock.NewRows([]string{"id"}))
		mock.ExpectBegin()
		mock.ExpectExec("INSERT INTO `consent_logs`").WillReturnResult(sqlmock.NewResult(1, 1))
		mock.ExpectCommit()
		expectProjectionClear(mock)

		if err := repo.SendConsentRequest(context.Background(), "p-1", "s-1", entity.ConsentPhoto); err != nil {
			t.Fatalf("fresh send must succeed, got %v", err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet expectations: %v", err)
		}
	})
}
