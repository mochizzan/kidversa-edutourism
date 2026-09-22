package frame_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
)

func newMockRepo(t *testing.T) (repository.FrameRepository, sqlmock.Sqlmock) {
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
	return persistence.NewFrameRepository(db), mock
}

func frameColumns() []string {
	return []string{
		"id", "tenant_id", "program_id", "name", "file_url",
		"thumbnail_url", "is_active", "sort_order",
		"created_at", "updated_at", "deleted_at",
	}
}

func TestFrameRepository_List_ProgramFilter_IncludesGlobalFrames(t *testing.T) {
	repo, mock := newMockRepo(t)

	cols := frameColumns()

	// Count query
	mock.ExpectQuery("SELECT count.*FROM").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))

	// Data query — regex asserts the OR clause is present in the WHERE.
	// If the old code (program_id = ?) is used, this regex won't match and
	// ExpectationsWereMet will fail.
	mock.ExpectQuery("OR.*program_id.*''.*OR.*program_id.*IS NULL").
		WillReturnRows(
			sqlmock.NewRows(cols).
				AddRow("f1", "tenant-1", "prog-1", "Program Frame", "http://f1.png", "", true, 1, time.Now(), time.Now(), nil).
				AddRow("f2", "tenant-1", "", "Global Frame", "http://f2.png", "", true, 2, time.Now(), time.Now(), nil),
		)

	result, err := repo.List(context.Background(), repository.FrameFilter{ProgramID: "prog-1"}, 1, 100)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Total != 2 {
		t.Errorf("expected Total=2, got %d", result.Total)
	}
	if len(result.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(result.Items))
	}

	var hasProgramFrame, hasGlobalFrame bool
	for _, f := range result.Items {
		if f.ProgramID == "prog-1" {
			hasProgramFrame = true
		}
		if f.ProgramID == "" {
			hasGlobalFrame = true
		}
	}
	if !hasProgramFrame {
		t.Error("expected a program-specific frame (program_id=prog-1)")
	}
	if !hasGlobalFrame {
		t.Error(`expected a global frame (program_id="")`)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestFrameRepository_List_NoProgramFilter_NoORClause(t *testing.T) {
	repo, mock := newMockRepo(t)

	cols := frameColumns()

	// Count query (no program filter → no OR clause)
	mock.ExpectQuery("SELECT count.*FROM").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	// Data query — simple match, no OR clause required
	mock.ExpectQuery("SELECT.*FROM").
		WillReturnRows(
			sqlmock.NewRows(cols).
				AddRow("f3", "tenant-1", "prog-1", "Some Frame", "http://f3.png", "", true, 1, time.Now(), time.Now(), nil),
		)

	result, err := repo.List(context.Background(), repository.FrameFilter{}, 1, 100)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Total != 1 {
		t.Errorf("expected Total=1, got %d", result.Total)
	}
	if len(result.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(result.Items))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
