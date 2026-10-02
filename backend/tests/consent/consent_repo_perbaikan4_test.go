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
