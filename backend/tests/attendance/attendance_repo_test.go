package attendance_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
)

// newMockAttendanceDB builds the real GormAttendanceRepository over a sqlmock
// DB (frame/session test pattern) so the per-topic keying can be asserted at
// the SQL level.
func newMockAttendanceDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
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
	return db, mock
}

func attRowColumns() []string {
	return []string{"id", "participant_id", "session_id", "session_stage_id", "is_present", "marked_at", "marked_by", "created_at", "updated_at", "deleted_at"}
}

// TestRepoUpsert_UsesFullTripleKey: the FirstOrCreate lookup must carry the
// full (participant, session, stage) triple — with the old double key the
// SELECT regex below (session_stage_id in WHERE) would not match and the
// test fails. A topic-B write then can never match topic-A's row.
func TestRepoUpsert_UsesFullTripleKey(t *testing.T) {
	db, mock := newMockAttendanceDB(t)
	repo := persistence.NewAttendanceRepository(db)

	// SELECT miss on the triple → INSERT path.
	mock.ExpectQuery("SELECT .* FROM `participant_attendance`.*participant_id.*session_id.*session_stage_id").
		WillReturnRows(sqlmock.NewRows(attRowColumns()))
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `participant_attendance`.*session_stage_id").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	now := time.Date(2026, 1, 15, 9, 30, 0, 0, time.UTC)
	markedBy := "fas-1"
	a := &entity.ParticipantAttendance{
		ParticipantID: "p-1", SessionID: "s-1", SessionStageID: "stage-B",
		IsPresent: false, MarkedAt: now, MarkedBy: &markedBy,
	}
	if err := repo.Upsert(context.Background(), a); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if a.SessionStageID != "stage-B" {
		t.Fatalf("SessionStageID = %q, want stage-B (topic-B write must keep its own topic)", a.SessionStageID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sqlmock expectations: %v", err)
	}
}

// TestRepoGetByParticipantSessionStage_Miss_NotFound keeps the structured
// NotFound contract the read path depends on (never nil, never swallowed).
func TestRepoGetByParticipantSessionStage_Miss_NotFound(t *testing.T) {
	db, mock := newMockAttendanceDB(t)
	repo := persistence.NewAttendanceRepository(db)

	mock.ExpectQuery("SELECT .* FROM `participant_attendance`.*session_stage_id").
		WillReturnRows(sqlmock.NewRows(attRowColumns()))

	_, err := repo.GetByParticipantSessionStage(context.Background(), "p-1", "s-1", "stage-A", "tenant-1")
	requireAppErrorCode(t, err, "not_found")
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sqlmock expectations: %v", err)
	}
}

// TestRepoListBySessionStage_ScopesToTopic: the list query must filter on
// session_stage_id so a per-topic read can never leak another topic's rows.
func TestRepoListBySessionStage_ScopesToTopic(t *testing.T) {
	db, mock := newMockAttendanceDB(t)
	repo := persistence.NewAttendanceRepository(db)

	now := time.Date(2026, 1, 15, 9, 30, 0, 0, time.UTC)
	mock.ExpectQuery("SELECT .* FROM `participant_attendance`.*session_id.*session_stage_id").
		WillReturnRows(sqlmock.NewRows(attRowColumns()).
			AddRow("a-1", "p-1", "s-1", "stage-A", true, now, nil, now, now, nil))

	rows, err := repo.ListBySessionStage(context.Background(), "s-1", "stage-A", "tenant-1")
	if err != nil {
		t.Fatalf("ListBySessionStage: %v", err)
	}
	if len(rows) != 1 || rows[0].SessionStageID != "stage-A" || !rows[0].IsPresent {
		t.Fatalf("scoped rows = %+v, want exactly the stage-A row", rows)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sqlmock expectations: %v", err)
	}
}
