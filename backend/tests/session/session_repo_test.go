package session_test

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

func newMockRepo(t *testing.T) (repository.SessionRepository, sqlmock.Sqlmock) {
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
	return persistence.NewSessionRepository(db), mock
}

func sessionColumns() []string {
	return []string{
		"id", "tenant_id", "program_id", "program_name", "name", "session_date",
		"start_time", "end_time", "location", "status", "notes", "created_by",
		"created_at", "updated_at", "deleted_at",
	}
}

// TestSessionRepository_ListSessions_EnrichesTopicsAndActivityCount proves the
// admin sessions list returns the per-session Topik names (topics) and the
// Kegiatan count (activity_count), batched in exactly two enrichment queries.
func TestSessionRepository_ListSessions_EnrichesTopicsAndActivityCount(t *testing.T) {
	repo, mock := newMockRepo(t)
	ctx := context.Background()

	// 1. Count query backing pagination.
	mock.ExpectQuery("SELECT count.*FROM").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))

	// 2. Main page query: two sessions, program_name already joined in.
	now := time.Now()
	mock.ExpectQuery("SELECT sessions\\.\\*.*programs\\.name AS program_name").
		WillReturnRows(
			sqlmock.NewRows(sessionColumns()).
				AddRow("s1", "t1", "p1", "Program A", "Session Satu", "2026-01-05", "09:00", "11:30", "Lab", "DRAFT", "", nil, now, now, nil).
				AddRow("s2", "t1", "p1", "Program A", "Session Dua", "2026-01-12", nil, nil, "Lab", "DRAFT", "", nil, now, now, nil),
		)

	// 3. Topic enrichment: s1 has two topics in clone order; s2 has none.
	mock.ExpectQuery("COALESCE.*st\\.program_stage_name").
		WillReturnRows(
			sqlmock.NewRows([]string{"session_id", "name"}).
				AddRow("s1", "Topik Satu").
				AddRow("s1", "Topik Dua"),
		)

	// 4. Kegiatan-count enrichment: only s1 appears (GROUP BY session_id), so
	// s2 must come back with a non-nil ActivityCount of 0.
	mock.ExpectQuery("COUNT\\(\\*\\).*session_substages").
		WillReturnRows(
			sqlmock.NewRows([]string{"session_id", "cnt"}).
				AddRow("s1", 3),
		)

	result, err := repo.ListSessions(ctx, repository.SessionFilter{}, 1, 100)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Total != 2 {
		t.Errorf("expected Total=2, got %d", result.Total)
	}
	if len(result.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(result.Items))
	}

	s1 := result.Items[0]
	if s1.ID != "s1" {
		t.Fatalf("expected first item s1, got %q", s1.ID)
	}
	if len(s1.Topics) != 2 || s1.Topics[0] != "Topik Satu" || s1.Topics[1] != "Topik Dua" {
		t.Errorf("expected s1 Topics == [Topik Satu Topik Dua], got %v", s1.Topics)
	}
	if s1.ActivityCount == nil {
		t.Fatal("expected s1 ActivityCount to be non-nil")
	}
	if *s1.ActivityCount != 3 {
		t.Errorf("expected s1 ActivityCount == 3, got %d", *s1.ActivityCount)
	}
	if s1.ProgramName != "Program A" {
		t.Errorf("expected program_name to remain populated, got %q", s1.ProgramName)
	}
	// Waktu: the planned time window must survive the enrichment path unchanged.
	if s1.StartTime == nil || *s1.StartTime != "09:00" {
		t.Errorf("expected s1 start_time 09:00, got %v", s1.StartTime)
	}
	if s1.EndTime == nil || *s1.EndTime != "11:30" {
		t.Errorf("expected s1 end_time 11:30, got %v", s1.EndTime)
	}

	s2 := result.Items[1]
	if s2.ID != "s2" {
		t.Fatalf("expected second item s2, got %q", s2.ID)
	}
	if len(s2.Topics) != 0 {
		t.Errorf("expected s2 to have no topics, got %v", s2.Topics)
	}
	if s2.ActivityCount == nil {
		t.Fatal("expected s2 ActivityCount to be non-nil")
	}
	if *s2.ActivityCount != 0 {
		t.Errorf("expected s2 ActivityCount == 0, got %d", *s2.ActivityCount)
	}
	if s2.StartTime != nil || s2.EndTime != nil {
		t.Errorf("expected s2 to keep nil time window, got %v/%v", s2.StartTime, s2.EndTime)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
