package assessment_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

func newMockAssessmentRepo(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
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

// TestAssessmentCreate_DenormalizesKegiatanViaProgramSubstages pins two fixes
// in one flow:
//  1. Migration 000010 Topic keys: Create resolves session_stage_id +
//     program_stage_id with ONE session_substages -> session_stages join.
//  2. Error 1054: session_substages has NO name column, so KegiatanName must be
//     resolved in two steps — session_substages.program_substage_id, then
//     program_substages.name. If the repo regresses to SELECT name FROM
//     session_substages, the sqlmock expectations below fail (unexpected query).
func TestAssessmentCreate_DenormalizesKegiatanViaProgramSubstages(t *testing.T) {
	db, mock := newMockAssessmentRepo(t)
	repo := persistence.NewAssessmentRepository(db)
	ctx := context.Background()

	mock.ExpectQuery("SELECT.*session_stage_id.*program_stage_id.*session_substages").
		WithArgs("ss-1").
		WillReturnRows(sqlmock.NewRows([]string{"session_stage_id", "program_stage_id"}).
			AddRow("stage-1", "ps-stage-1"))
	mock.ExpectQuery("SELECT.*child_name.*participants").
		WillReturnRows(sqlmock.NewRows([]string{"child_name"}).AddRow("Anak A"))
	mock.ExpectQuery("SELECT.*program_substage_id.*session_substages").
		WillReturnRows(sqlmock.NewRows([]string{"program_substage_id"}).AddRow("ps-1"))
	mock.ExpectQuery("SELECT.*name.*program_substages").
		WillReturnRows(sqlmock.NewRows([]string{"name"}).AddRow("Kegiatan Hebat"))
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `assessments`").WithArgs(
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
	).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	a := &entity.Assessment{
		BaseModel:         entity.BaseModel{ID: "a-1"},
		ParticipantID:     "p-1",
		SessionID:         "s-1",
		SessionSubstageID: "ss-1",
		StarRating:        5,
		Comment:           "bagus",
		AssessedBy:        "u-1",
	}
	if err := repo.Create(ctx, a); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if a.ParticipantName != "Anak A" {
		t.Errorf("ParticipantName = %q, want %q", a.ParticipantName, "Anak A")
	}
	if a.KegiatanName != "Kegiatan Hebat" {
		t.Errorf("KegiatanName = %q, want %q", a.KegiatanName, "Kegiatan Hebat")
	}
	if a.SessionStageID != "stage-1" {
		t.Errorf("SessionStageID = %q, want %q", a.SessionStageID, "stage-1")
	}
	if a.ProgramStageID != "ps-stage-1" {
		t.Errorf("ProgramStageID = %q, want %q", a.ProgramStageID, "ps-stage-1")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// TestAssessmentCreate_KegiatanLookupFailure_LogsAndContinues: a failed name
// lookup must never fail the insert nor be swallowed silently — Create still
// persists the row (with empty KegiatanName) after logging.
func TestAssessmentCreate_KegiatanLookupFailure_LogsAndContinues(t *testing.T) {
	db, mock := newMockAssessmentRepo(t)
	repo := persistence.NewAssessmentRepository(db)
	ctx := context.Background()

	mock.ExpectQuery("SELECT.*session_stage_id.*program_stage_id.*session_substages").
		WithArgs("ss-1").
		WillReturnRows(sqlmock.NewRows([]string{"session_stage_id", "program_stage_id"}).
			AddRow("stage-1", "ps-stage-1"))
	mock.ExpectQuery("SELECT.*child_name.*participants").
		WillReturnRows(sqlmock.NewRows([]string{"child_name"}).AddRow("Anak A"))
	mock.ExpectQuery("SELECT.*program_substage_id.*session_substages").
		WillReturnRows(sqlmock.NewRows([]string{"program_substage_id"}).AddRow("ps-1"))
	mock.ExpectQuery("SELECT.*name.*program_substages").
		WillReturnError(context.DeadlineExceeded)
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `assessments`").WithArgs(
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
	).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	a := &entity.Assessment{
		BaseModel:         entity.BaseModel{ID: "a-2"},
		ParticipantID:     "p-1",
		SessionID:         "s-1",
		SessionSubstageID: "ss-1",
		StarRating:        4,
		AssessedBy:        "u-1",
	}
	if err := repo.Create(ctx, a); err != nil {
		t.Fatalf("Create must succeed despite name lookup failure: %v", err)
	}
	if a.KegiatanName != "" {
		t.Errorf("KegiatanName = %q, want empty on lookup failure", a.KegiatanName)
	}
	if a.SessionStageID != "stage-1" || a.ProgramStageID != "ps-stage-1" {
		t.Errorf("topic keys = %q/%q, want stage-1/ps-stage-1", a.SessionStageID, a.ProgramStageID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// TestAssessmentCreate_TopicKeyResolveFailure_ReturnsInternal: the Topic-key
// query feeds report/badge scoping, so a FAILURE must surface as an explicit
// internal error (never log-swallowed into a ”-” row) and must not insert.
func TestAssessmentCreate_TopicKeyResolveFailure_ReturnsInternal(t *testing.T) {
	db, mock := newMockAssessmentRepo(t)
	repo := persistence.NewAssessmentRepository(db)

	mock.ExpectQuery("SELECT.*session_stage_id.*program_stage_id.*session_substages").
		WithArgs("ss-1").
		WillReturnError(context.DeadlineExceeded)

	a := &entity.Assessment{
		BaseModel:         entity.BaseModel{ID: "a-3"},
		ParticipantID:     "p-1",
		SessionID:         "s-1",
		SessionSubstageID: "ss-1",
		StarRating:        5,
		AssessedBy:        "u-1",
	}
	err := repo.Create(context.Background(), a)
	if err == nil {
		t.Fatal("expected internal error on topic-key resolution failure, got nil")
	} else if _, code, ok := apperrors.AsAppError(err); !ok || code != "internal_error" {
		t.Errorf("expected code internal_error, got %q (ok=%v, err=%v)", code, ok, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// TestAssessmentCreate_TopicKeyResolveMiss_LeavesSentinel: no resolvable stage
// row → both keys stay ” (sentinel, never fabricated) and the insert proceeds.
func TestAssessmentCreate_TopicKeyResolveMiss_LeavesSentinel(t *testing.T) {
	db, mock := newMockAssessmentRepo(t)
	repo := persistence.NewAssessmentRepository(db)

	mock.ExpectQuery("SELECT.*session_stage_id.*program_stage_id.*session_substages").
		WithArgs("ss-unknown").
		WillReturnRows(sqlmock.NewRows([]string{"session_stage_id", "program_stage_id"}))
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `assessments`").WithArgs(
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
	).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	a := &entity.Assessment{
		BaseModel:         entity.BaseModel{ID: "a-4"},
		ParticipantID:     "p-1",
		SessionID:         "s-1",
		SessionSubstageID: "ss-unknown",
		ParticipantName:   "Anak A",
		KegiatanName:      "Kegiatan Hebat",
		StarRating:        3,
		AssessedBy:        "u-1",
	}
	if err := repo.Create(context.Background(), a); err != nil {
		t.Fatalf("Create must succeed on unresolvable topic keys: %v", err)
	}
	if a.SessionStageID != "" || a.ProgramStageID != "" {
		t.Errorf("topic keys = %q/%q, want ''/'' sentinel", a.SessionStageID, a.ProgramStageID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// TestAssessmentGetByParticipantStage_Miss_NotFound keeps the structured
// NotFound contract the Upsert revive-or-create flow depends on (never nil).
func TestAssessmentGetByParticipantStage_Miss_NotFound(t *testing.T) {
	db, mock := newMockAssessmentRepo(t)
	repo := persistence.NewAssessmentRepository(db)

	mock.ExpectQuery("SELECT.*assessments").
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	if _, err := repo.GetByParticipantStage(context.Background(), "p-1", "ss-1", "t-1"); err == nil {
		t.Fatal("expected NotFound error, got nil")
	} else if _, code, ok := apperrors.AsAppError(err); !ok || code != "not_found" {
		t.Errorf("expected code not_found, got %q (ok=%v, err=%v)", code, ok, err)
	}

	mock.ExpectQuery("SELECT.*assessments").
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	if _, err := repo.GetByParticipantStageIncludingDeleted(context.Background(), "p-1", "ss-1", "t-1"); err == nil {
		t.Fatal("expected NotFound error, got nil")
	} else if _, code, ok := apperrors.AsAppError(err); !ok || code != "not_found" {
		t.Errorf("expected code not_found, got %q (ok=%v, err=%v)", code, ok, err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
