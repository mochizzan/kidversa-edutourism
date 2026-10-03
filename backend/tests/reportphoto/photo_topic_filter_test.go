package reportphoto_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
)

// ---------------------------------------------------------------------------
// GET /api/photos topic filter — PARAM-PRESENCE semantics (migration 000009):
// param absent → no stage filter (any topic); param present with an empty
// value (?session_stage_id=) → strict session_stage_id = '' (legacy bucket);
// param present with a value → strict equality on that stage. The frontend
// depends on this exactly, so it is pinned at the handler boundary.
// ---------------------------------------------------------------------------

func TestList_TopicParamPresence(t *testing.T) {
	const stageValue = "99999999-9999-4999-8999-999999999999"
	cases := []struct {
		name    string
		url     string
		wantNil bool // true = filter absent (all topics)
		want    string
	}{
		{"param absent → no stage filter (all topics)", "/api/photos", true, ""},
		{"param present, empty value → strict legacy bucket ''", "/api/photos?session_stage_id=", false, ""},
		{"param present with value → strict stage", "/api/photos?session_stage_id=" + stageValue, false, stageValue},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fake := newFakePhotoRepo()
			h, e := newPickHandler(fake)

			req := httptest.NewRequest(http.MethodGet, tc.url, nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)
			if err := h.List(c); err != nil {
				t.Fatalf("List returned error: %v", err)
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
			}
			got := fake.lastListFilter.SessionStageID
			if tc.wantNil {
				if got != nil {
					t.Fatalf("SessionStageID filter = %q, want nil (param absent must not narrow the list)", *got)
				}
				return
			}
			if got == nil {
				t.Fatalf("SessionStageID filter = nil, want strict filter %q", tc.want)
			}
			if *got != tc.want {
				t.Fatalf("SessionStageID filter = %q, want %q", *got, tc.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// GormPhotoRepository.ListPhotos — the WHERE clause itself: a non-nil
// SessionStageID must add `session_stage_id = ?` (strict equality, also for
// the empty legacy value), a nil must add NOTHING. sqlmock, repo convention
// (attendance/frame tests). The read-back row also proves the entity field
// maps to the session_stage_id column (000009) with no phantom column.
// ---------------------------------------------------------------------------

func photoColumns() []string {
	return []string{
		"id", "participant_id", "session_id", "session_stage_id", "frame_id",
		"original_file_url", "framed_file_url", "is_report_photo", "taken_by",
		"taken_at", "file_size", "created_at", "updated_at", "deleted_at",
	}
}

// recordingMatcher records every executed SQL string and matches leniently —
// expectations are consumed in order, and the tests assert on the recorded
// SQL text itself.
type recordingMatcher struct{ queries *[]string }

func (m recordingMatcher) Match(expectedSQL, actualSQL string) error {
	// sqlmock invokes Match(expected, actual) in this version — record the
	// ACTUAL executed SQL (the second argument).
	*m.queries = append(*m.queries, actualSQL)
	return nil
}

// newRecordingPhotoDB opens a sqlmock-backed GORM over the real
// GormPhotoRepository, recording every executed SQL string.
func newRecordingPhotoDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, *[]string) {
	t.Helper()
	queries := &[]string{}
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(recordingMatcher{queries: queries}))
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
	return db, mock, queries
}

func TestListPhotos_TopicFilterSQL(t *testing.T) {
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	photoRow := func(id, stage string) *sqlmock.Rows {
		return sqlmock.NewRows(photoColumns()).
			AddRow(id, "p-1", "s-1", stage, nil, "photos/x.jpg", "", false, "u-1", now, nil, now, now, nil)
	}
	// Each ListPhotos call issues exactly two queries: COUNT then the
	// page-limited SELECT; both carry the same WHERE.
	expectTwo := func(mock sqlmock.Sqlmock, id, stage string) {
		mock.ExpectQuery("count").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
		mock.ExpectQuery("select").WillReturnRows(photoRow(id, stage))
	}
	stagePredicate := func(t *testing.T, queries *[]string) []string {
		t.Helper()
		var hits []string
		for _, q := range *queries {
			if strings.Contains(q, "session_stage_id =") {
				hits = append(hits, q)
			}
		}
		return hits
	}

	t.Run("nil filter → no session_stage_id predicate (all topics)", func(t *testing.T) {
		db, mock, queries := newRecordingPhotoDB(t)
		repo := persistence.NewPhotoRepository(db)
		expectTwo(mock, "a-1", "")

		_, err := repo.ListPhotos(context.Background(), repository.PhotoFilter{ParticipantID: "p-1"}, 1, 10)
		if err != nil {
			t.Fatalf("ListPhotos: %v", err)
		}
		if hits := stagePredicate(t, queries); len(hits) != 0 {
			t.Fatalf("unexpected session_stage_id predicate for a nil filter: %v", hits)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("unmet sqlmock expectations: %v", err)
		}
	})

	t.Run("empty-value filter → strict session_stage_id = ? (legacy bucket)", func(t *testing.T) {
		db, mock, queries := newRecordingPhotoDB(t)
		repo := persistence.NewPhotoRepository(db)
		expectTwo(mock, "legacy-1", "")

		legacy := ""
		pag, err := repo.ListPhotos(context.Background(), repository.PhotoFilter{
			ParticipantID: "p-1", SessionStageID: &legacy,
		}, 1, 10)
		if err != nil {
			t.Fatalf("ListPhotos: %v", err)
		}
		hits := stagePredicate(t, queries)
		if len(hits) < 2 {
			t.Fatalf("want session_stage_id predicate on COUNT and SELECT, got %d hit(s): %v", len(hits), queries)
		}
		if len(pag.Items) != 1 || pag.Items[0].SessionStageID != "" {
			t.Fatalf("items = %+v, want exactly the legacy row", pag.Items)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("unmet sqlmock expectations: %v", err)
		}
	})

	t.Run("stage filter → strict session_stage_id = ? on COUNT and SELECT", func(t *testing.T) {
		db, mock, queries := newRecordingPhotoDB(t)
		repo := persistence.NewPhotoRepository(db)
		expectTwo(mock, "a-1", "ss-1")

		stage := "ss-1"
		pag, err := repo.ListPhotos(context.Background(), repository.PhotoFilter{
			ParticipantID: "p-1", SessionID: "s-1", SessionStageID: &stage,
		}, 1, 10)
		if err != nil {
			t.Fatalf("ListPhotos: %v", err)
		}
		hits := stagePredicate(t, queries)
		if len(hits) < 2 {
			t.Fatalf("want session_stage_id predicate on COUNT and SELECT, got %d hit(s): %v", len(hits), queries)
		}
		// Round-trip: the column maps back onto entity.SmartPhoto.SessionStageID.
		if len(pag.Items) != 1 || pag.Items[0].SessionStageID != "ss-1" {
			t.Fatalf("items = %+v, want the ss-1 row with SessionStageID preserved", pag.Items)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("unmet sqlmock expectations: %v", err)
		}
	})
}
