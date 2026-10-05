package programstage_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v5"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
)

const (
	stageID   = "550e8400-e29b-41d4-a716-446655440000"
	programID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
)

// fakeProgramRepo is an in-memory repository.ProgramRepository. GetStageByID
// serves a preloaded stage (simulating the load-then-mutate flow of
// UpdateStage) and UpdateStage records the entity the handler handed over so
// tests can assert exactly what would be written.
type fakeProgramRepo struct {
	loaded      entity.ProgramStage
	updated     *entity.ProgramStage
	updateCount int
}

func (f *fakeProgramRepo) GetStageByID(context.Context, string) (*entity.ProgramStage, error) {
	s := f.loaded
	return &s, nil
}

func (f *fakeProgramRepo) UpdateStage(_ context.Context, s *entity.ProgramStage) error {
	f.updateCount++
	cp := *s
	f.updated = &cp
	return nil
}

// The remaining ProgramRepository methods are not exercised by UpdateStage.
func (f *fakeProgramRepo) CreateProgram(context.Context, *entity.Program) error {
	panic("unexpected CreateProgram")
}
func (f *fakeProgramRepo) CountProgramSessions(context.Context, string) (int64, error) {
	panic("unexpected CountProgramSessions")
}
func (f *fakeProgramRepo) ListProgramSessionBriefs(context.Context, string, int) ([]entity.Session, error) {
	panic("unexpected ListProgramSessionBriefs")
}
func (f *fakeProgramRepo) DeleteProgramForce(context.Context, string) error {
	panic("unexpected DeleteProgramForce")
}
func (f *fakeProgramRepo) GetProgramByID(context.Context, string) (*entity.Program, error) {
	panic("unexpected GetProgramByID")
}
func (f *fakeProgramRepo) ListPrograms(context.Context, repository.ProgramFilter, int, int) (*repository.Paginated[entity.Program], error) {
	panic("unexpected ListPrograms")
}
func (f *fakeProgramRepo) UpdateProgram(context.Context, *entity.Program) error {
	panic("unexpected UpdateProgram")
}
func (f *fakeProgramRepo) DeleteProgram(context.Context, string) error {
	panic("unexpected DeleteProgram")
}
func (f *fakeProgramRepo) ToggleActiveProgram(context.Context, string) (*entity.Program, error) {
	panic("unexpected ToggleActiveProgram")
}
func (f *fakeProgramRepo) CreateStage(context.Context, *entity.ProgramStage) error {
	panic("unexpected CreateStage")
}
func (f *fakeProgramRepo) ListStages(context.Context, string) ([]entity.ProgramStage, error) {
	panic("unexpected ListStages")
}
func (f *fakeProgramRepo) ListPaginatedStages(context.Context, repository.StageFilter, int, int) (*repository.Paginated[entity.ProgramStage], error) {
	panic("unexpected ListPaginatedStages")
}
func (f *fakeProgramRepo) DeleteStage(context.Context, string) error {
	panic("unexpected DeleteStage")
}
func (f *fakeProgramRepo) ListStageContents(context.Context, string) ([]entity.StageContent, error) {
	panic("unexpected ListStageContents")
}

// loadedStage is the stage as it exists in the DB before the PUT.
func loadedStage() entity.ProgramStage {
	return entity.ProgramStage{
		BaseModel:     entity.BaseModel{ID: stageID},
		ProgramID:     programID,
		SequenceOrder: 2,
		Name:          "Topik Lama",
		Description:   "deskripsi lama",
		ContentType:   entity.ContentTypeVideo,
		BadgeName:     "Penjelajah Senior",
		BadgeImageURL: "https://cdn.example/badge/old.png",
	}
}

// runUpdateStage performs one PUT through ProgramHandler.UpdateStage.
func runUpdateStage(t *testing.T, repo repository.ProgramRepository, body string) *httptest.ResponseRecorder {
	t.Helper()
	h := handler.NewProgramHandler(repo, nil, nil)
	e := echo.New()
	req := httptest.NewRequest(http.MethodPut, "/api/programs/"+programID+"/stages/"+stageID, strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{
		{Name: "id", Value: programID},
		{Name: "stageId", Value: stageID},
	})
	if err := h.UpdateStage(c); err != nil {
		t.Fatalf("UpdateStage returned error: %v", err)
	}
	return rec
}

// TestUpdateStage_BadgeFieldsSetOnEdit: a body carrying badge_name and
// badge_image_url must reach the repository on the loaded entity — before the
// fix these keys were silently dropped at binding and never copied.
func TestUpdateStage_BadgeFieldsSetOnEdit(t *testing.T) {
	repo := &fakeProgramRepo{loaded: loadedStage()}
	body := `{"name":"Topik Baru","content_type":"VIDEO",` +
		`"badge_name":"Sang Penjelajah","badge_image_url":"https://cdn.example/badge/new.png"}`
	rec := runUpdateStage(t, repo, body)

	if repo.updateCount != 1 {
		t.Fatalf("expected exactly 1 UpdateStage call, got %d", repo.updateCount)
	}
	if repo.updated.BadgeName != "Sang Penjelajah" {
		t.Errorf("BadgeName = %q, want %q", repo.updated.BadgeName, "Sang Penjelajah")
	}
	if repo.updated.BadgeImageURL != "https://cdn.example/badge/new.png" {
		t.Errorf("BadgeImageURL = %q, want %q", repo.updated.BadgeImageURL, "https://cdn.example/badge/new.png")
	}
	if repo.updated.Name != "Topik Baru" {
		t.Errorf("Name = %q, want %q (handler must still apply the other fields)", repo.updated.Name, "Topik Baru")
	}
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
}

// TestUpdateStage_BadgeFieldsEmptyClears: an explicitly present "" must clear
// the stored badge (pointer non-nil semantics), mirroring the Program path.
func TestUpdateStage_BadgeFieldsEmptyClears(t *testing.T) {
	repo := &fakeProgramRepo{loaded: loadedStage()}
	body := `{"name":"Topik Lama","content_type":"VIDEO","badge_name":"","badge_image_url":""}`
	runUpdateStage(t, repo, body)

	if repo.updateCount != 1 {
		t.Fatalf("expected exactly 1 UpdateStage call, got %d", repo.updateCount)
	}
	if repo.updated.BadgeName != "" {
		t.Errorf("BadgeName = %q, want empty (present empty string must clear)", repo.updated.BadgeName)
	}
	if repo.updated.BadgeImageURL != "" {
		t.Errorf("BadgeImageURL = %q, want empty (present empty string must clear)", repo.updated.BadgeImageURL)
	}
}

// TestUpdateStage_BadgeFieldsAbsentKeepsStored: a body without the badge keys
// must leave the DB-loaded badge values untouched (skip semantics) while still
// applying the other fields.
func TestUpdateStage_BadgeFieldsAbsentKeepsStored(t *testing.T) {
	loaded := loadedStage()
	repo := &fakeProgramRepo{loaded: loaded}
	body := `{"name":"Topik Baru","content_type":"VIDEO"}`
	runUpdateStage(t, repo, body)

	if repo.updateCount != 1 {
		t.Fatalf("expected exactly 1 UpdateStage call, got %d", repo.updateCount)
	}
	if repo.updated.BadgeName != loaded.BadgeName {
		t.Errorf("BadgeName = %q, want stored %q (absent key must skip)", repo.updated.BadgeName, loaded.BadgeName)
	}
	if repo.updated.BadgeImageURL != loaded.BadgeImageURL {
		t.Errorf("BadgeImageURL = %q, want stored %q (absent key must skip)", repo.updated.BadgeImageURL, loaded.BadgeImageURL)
	}
	if repo.updated.Name != "Topik Baru" {
		t.Errorf("Name = %q, want %q", repo.updated.Name, "Topik Baru")
	}
}

// TestUpdateStage_RepoWritesBadgeColumns: the map-form UPDATE issued by
// GormProgramRepository.UpdateStage must include the badge_name and
// badge_image_url columns in its SET clause (the columns existed in the DDL
// but were never referenced by any write path before this fix). The follow-up
// session_stages denormalization UPDATE is expected too.
func TestUpdateStage_RepoWritesBadgeColumns(t *testing.T) {
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()
	db, err := gorm.Open(mysql.New(mysql.Config{
		Conn:                      sqlDB,
		SkipInitializeWithVersion: true,
	}), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open gorm: %v", err)
	}
	repo := persistence.NewProgramRepository(db)

	// Map iteration order is unspecified, so accept either badge column order.
	stageUpd := "UPDATE `program_stages` SET .*badge_name.*badge_image_url|" +
		"UPDATE `program_stages` SET .*badge_image_url.*badge_name"
	// Production opens GORM with &gorm.Config{} (SkipDefaultTransaction off),
	// so each write is wrapped in Begin/Commit — mirrored here.
	mock.ExpectBegin()
	mock.ExpectExec(stageUpd).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `session_stages` SET `program_stage_name`").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	stage := loadedStage()
	stage.BadgeName = "Sang Penjelajah"
	stage.BadgeImageURL = "https://cdn.example/badge/new.png"
	if err := repo.UpdateStage(context.Background(), &stage); err != nil {
		t.Fatalf("UpdateStage returned error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sqlmock expectations: %v", err)
	}
}
