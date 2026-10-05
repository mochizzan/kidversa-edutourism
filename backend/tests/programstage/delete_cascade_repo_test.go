package programstage_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
)

func newProgramRepoMock(t *testing.T) (repository.ProgramRepository, sqlmock.Sqlmock) {
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
	return persistence.NewProgramRepository(db), mock
}

func newSessionRepoMock(t *testing.T) (repository.SessionRepository, sqlmock.Sqlmock) {
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
	return persistence.NewSessionRepository(db), mock
}

// TestDeleteSession_PurgesNoFKChildrenThenHardDeletes (audit #2, scenario 4):
// DeleteSession must run in ONE transaction that first purges every table
// carrying session_id WITHOUT an FK to sessions (group_stage_progress_history,
// timeline_events, gallery_tokens), then physically deletes the session row
// so the ON DELETE CASCADE children fire — leaving zero rows pointing at the
// session anywhere.
func TestDeleteSession_PurgesNoFKChildrenThenHardDeletes(t *testing.T) {
	repo, mock := newSessionRepoMock(t)
	ctx := context.Background()
	const sid = "s1"

	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM group_stage_progress_history WHERE session_id = \\?").
		WithArgs(sid).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DELETE FROM timeline_events WHERE session_id = \\?").
		WithArgs(sid).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DELETE FROM gallery_tokens WHERE session_id = \\?").
		WithArgs(sid).WillReturnResult(sqlmock.NewResult(0, 1))
	// Unscoped ⇒ no deleted_at predicate: the row is physically removed.
	mock.ExpectExec("DELETE FROM `sessions` WHERE id = \\?").
		WithArgs(sid).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := repo.DeleteSession(ctx, sid); err != nil {
		t.Fatalf("DeleteSession returned error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sqlmock expectations: %v", err)
	}
}

// TestDeleteSessionGroup_HardDeletesWithChildren (audit #5, scenario 5):
// DeleteSessionGroup must hard-delete the group in one transaction after
// purging the two group_id children without FKs; group_stage_progress cascades
// via its FK and members survive via FK SET NULL.
func TestDeleteSessionGroup_HardDeletesWithChildren(t *testing.T) {
	repo, mock := newSessionRepoMock(t)
	ctx := context.Background()
	const gid = "g1"

	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM group_stage_progress_history WHERE group_id = \\?").
		WithArgs(gid).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DELETE FROM timeline_events WHERE group_id = \\?").
		WithArgs(gid).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DELETE FROM `session_groups` WHERE id = \\?").
		WithArgs(gid).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := repo.DeleteSessionGroup(ctx, gid); err != nil {
		t.Fatalf("DeleteSessionGroup returned error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sqlmock expectations: %v", err)
	}
}

// TestDeleteStage_PurgesStageRowsThenHardDeletes (audit #5, scenario 5):
// DeleteStage must hard-delete the Topik in one transaction after purging the
// tables that reference program_stage_id WITHOUT an FK (assessments, reports,
// report_photo_picks); the FK children (program_substages, session_stages,
// mission_bank_stages, participant_badges) cascade on the physical delete.
func TestDeleteStage_PurgesStageRowsThenHardDeletes(t *testing.T) {
	repo, mock := newProgramRepoMock(t)
	ctx := context.Background()

	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM assessments WHERE program_stage_id = \\?").
		WithArgs(stageID).WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec("DELETE FROM reports WHERE program_stage_id = \\?").
		WithArgs(stageID).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DELETE FROM report_photo_picks WHERE program_stage_id = \\?").
		WithArgs(stageID).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DELETE FROM `program_stages` WHERE id = \\?").
		WithArgs(stageID).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := repo.DeleteStage(ctx, stageID); err != nil {
		t.Fatalf("DeleteStage returned error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sqlmock expectations: %v", err)
	}
}

// TestDeleteProgramForce_PurgesEverySessionThenProgram (audit #1/#2,
// scenario 3): DeleteProgramForce must, in ONE transaction, list ALL sessions
// of the program (Unscoped — no deleted_at predicate), purge each session
// with its children, then physically delete the program row so its own FK
// cascades fire.
func TestDeleteProgramForce_PurgesEverySessionThenProgram(t *testing.T) {
	repo, mock := newProgramRepoMock(t)
	ctx := context.Background()

	mock.ExpectBegin()
	// Unscoped pluck: SELECT id FROM sessions WHERE program_id = ?
	// (a scoped query would carry a deleted_at IS NULL predicate and fail).
	mock.ExpectQuery("SELECT `id` FROM `sessions` WHERE program_id = \\?").
		WithArgs(programID).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("s1").AddRow("s2"))

	for _, sid := range []string{"s1", "s2"} {
		mock.ExpectExec("DELETE FROM group_stage_progress_history WHERE session_id = \\?").
			WithArgs(sid).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec("DELETE FROM timeline_events WHERE session_id = \\?").
			WithArgs(sid).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec("DELETE FROM gallery_tokens WHERE session_id = \\?").
			WithArgs(sid).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec("DELETE FROM `sessions` WHERE id = \\?").
			WithArgs(sid).WillReturnResult(sqlmock.NewResult(0, 1))
	}

	mock.ExpectExec("DELETE FROM `programs` WHERE id = \\?").
		WithArgs(programID).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := repo.DeleteProgramForce(ctx, programID); err != nil {
		t.Fatalf("DeleteProgramForce returned error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sqlmock expectations: %v", err)
	}
}
