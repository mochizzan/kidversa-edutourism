package refresh_test

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/infrastructure/persistence"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

func newMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
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

// Miss → 401 token_invalid (structured, not raw gorm error).
func TestRefreshGetByHash_Miss_TokenInvalid(t *testing.T) {
	db, mock := newMockDB(t)
	repo := persistence.NewGormRefreshRepository(db)

	mock.ExpectQuery("SELECT.*refresh_tokens").
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	if _, err := repo.GetByHash(context.Background(), "nope"); err == nil {
		t.Fatal("expected error, got nil")
	} else if st, code, ok := apperrors.AsAppError(err); !ok || st != 401 || code != "token_invalid" {
		t.Errorf("expected 401/token_invalid, got status=%d code=%q ok=%v err=%v", st, code, ok, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// DB failure → 500 internal_error (must NOT be disguised as 401).
func TestRefreshGetByHash_DBSailure_Internal(t *testing.T) {
	db, mock := newMockDB(t)
	repo := persistence.NewGormRefreshRepository(db)

	mock.ExpectQuery("SELECT.*refresh_tokens").
		WillReturnError(errors.New("connection refused"))

	if _, err := repo.GetByHash(context.Background(), "x"); err == nil {
		t.Fatal("expected error, got nil")
	} else if st, code, ok := apperrors.AsAppError(err); !ok || st != 500 || code != "internal_error" {
		t.Errorf("expected 500/internal_error, got status=%d code=%q ok=%v err=%v", st, code, ok, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
