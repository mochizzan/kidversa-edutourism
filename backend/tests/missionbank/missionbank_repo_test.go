package missionbank_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
)

func newMockRepo(t *testing.T) (repository.MissionBankRepository, sqlmock.Sqlmock) {
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
	return persistence.NewMissionBankRepository(db), mock
}

// The Topic filter must keep the FULL row in the SELECT list. The previous
// implementation (JOIN mission_bank_stages + Distinct("mission_banks.id")) was
// rendered by GORM as SELECT DISTINCT mission_banks.id — only the id column was
// scanned, so Title came back empty and the parent mini-rapor section
// "MISI RUMAH BERSAMA KELUARGA" rendered blank mission rows
// (GET /api/reports/access missions[].title == ""). This matcher rejects any
// data query that does not select from the base table with the junction used
// as an IN-subquery instead.
func TestMissionBankRepository_List_TopicFilter_SelectsFullRows(t *testing.T) {
	repo, mock := newMockRepo(t)

	// Count query — no column restriction.
	mock.ExpectQuery("SELECT count.*mission_banks").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	// Data query: full-row select with the junction as an IN-subquery.
	// The old JOIN+Distinct(id) SQL does not match this pattern.
	mock.ExpectQuery(
		"SELECT \\* FROM `mission_banks`.*IN \\(SELECT mission_bank_id FROM mission_bank_stages WHERE program_stage_id",
	).WillReturnRows(
		sqlmock.NewRows([]string{"id", "tenant_id", "program_id", "title", "is_active"}).
			AddRow("m1", "t1", "p1", "Misi Rumah Bersama Keluarga", true),
	)

	// loadRelatedStages follow-up for the returned ids (junction is pure, no
	// soft-delete): empty result is fine.
	mock.ExpectQuery("SELECT .*FROM `mission_bank_stages`").
		WillReturnRows(sqlmock.NewRows([]string{"mission_bank_id", "program_stage_id", "sort_order"}))

	res, err := repo.List(context.Background(), repository.MissionBankFilter{
		TenantID: "t1",
		TopicID:  "stage-1",
		IsActive: new(true),
	}, 1, 100)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Total != 1 {
		t.Errorf("expected Total=1, got %d", res.Total)
	}
	if len(res.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(res.Items))
	}
	// Consumer-visible assertion: titles must survive the topic-scoped query
	// (public report payload + AI suggestion prompts read entity.Title).
	if got := res.Items[0].Title; got != "Misi Rumah Bersama Keluarga" {
		t.Errorf("expected title preserved, got %q", got)
	}
	if res.Items[0].ID != "m1" || res.Items[0].ProgramID != "p1" || !res.Items[0].IsActive {
		t.Errorf("expected full row fields, got %+v", res.Items[0])
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
