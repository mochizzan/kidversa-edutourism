package reportphoto_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// ---------------------------------------------------------------------------
// fakePhotoRepo is an in-memory PhotoRepository — no DB, per repo test
// convention (mirror of tests/frame's fakeFrameRepo). Pick methods implement
// uq_photo_pick semantics (upsert last-wins on participant+session+stage).
// ---------------------------------------------------------------------------

type fakePhotoRepo struct {
	photos           map[string]*entity.SmartPhoto
	tenantOf         map[string]string // photoID -> owning tenant (fake-side field)
	picks            map[string]entity.ReportPhotoPick
	deletePhotoCalls int
}

func newFakePhotoRepo() *fakePhotoRepo {
	return &fakePhotoRepo{
		photos:   map[string]*entity.SmartPhoto{},
		tenantOf: map[string]string{},
		picks:    map[string]entity.ReportPhotoPick{},
	}
}

func pickKey(participantID, sessionID, programStageID string) string {
	return participantID + "|" + sessionID + "|" + programStageID
}

func (f *fakePhotoRepo) CreatePhoto(_ context.Context, p *entity.SmartPhoto) error {
	f.photos[p.ID] = p
	return nil
}

func (f *fakePhotoRepo) GetPhotoByID(_ context.Context, id, tenantID string) (*entity.SmartPhoto, error) {
	p, ok := f.photos[id]
	if !ok {
		return nil, apperrors.NotFound("not_found", nil)
	}
	if tenantID != "" && f.tenantOf[id] != tenantID {
		return nil, apperrors.NotFound("not_found", nil)
	}
	clone := *p
	return &clone, nil
}

func (f *fakePhotoRepo) ListPhotos(_ context.Context, filt repository.PhotoFilter, _, _ int) (*repository.Paginated[entity.SmartPhoto], error) {
	out := make([]entity.SmartPhoto, 0, len(f.photos))
	for _, p := range f.photos {
		if filt.ParticipantID != "" && p.ParticipantID != filt.ParticipantID {
			continue
		}
		if filt.SessionID != "" && p.SessionID != filt.SessionID {
			continue
		}
		if filt.IsReportPhoto != nil && p.IsReportPhoto != *filt.IsReportPhoto {
			continue
		}
		out = append(out, *p)
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: out, Total: len(out)}, nil
}

func (f *fakePhotoRepo) UpdatePhoto(_ context.Context, p *entity.SmartPhoto) error {
	f.photos[p.ID] = p
	return nil
}

func (f *fakePhotoRepo) UpdatePhotoFields(context.Context, string, map[string]interface{}) error {
	return nil
}

func (f *fakePhotoRepo) SetReportPhoto(context.Context, string, string, string) error { return nil }

func (f *fakePhotoRepo) DeletePhoto(_ context.Context, id string) error {
	f.deletePhotoCalls++
	delete(f.photos, id)
	return nil
}

func (f *fakePhotoRepo) UpsertReportPhotoPick(_ context.Context, pick *entity.ReportPhotoPick) error {
	// uq_photo_pick semantics: same participant+session+stage replaces the row.
	f.picks[pickKey(pick.ParticipantID, pick.SessionID, pick.ProgramStageID)] = *pick
	return nil
}

func (f *fakePhotoRepo) GetReportPhotoPick(_ context.Context, participantID, sessionID, programStageID string) (*entity.ReportPhotoPick, error) {
	pick, ok := f.picks[pickKey(participantID, sessionID, programStageID)]
	if !ok {
		return nil, nil
	}
	return &pick, nil
}

func (f *fakePhotoRepo) ListReportPhotoPicks(_ context.Context, participantID, sessionID string) ([]entity.ReportPhotoPick, error) {
	out := make([]entity.ReportPhotoPick, 0, len(f.picks))
	for _, pick := range f.picks {
		if pick.ParticipantID == participantID && pick.SessionID == sessionID {
			out = append(out, pick)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ProgramStageID < out[j].ProgramStageID })
	return out, nil
}

func (f *fakePhotoRepo) DeleteReportPhotoPick(_ context.Context, participantID, sessionID, programStageID string) error {
	delete(f.picks, pickKey(participantID, sessionID, programStageID))
	return nil
}

// requireAppErrorCode asserts err unwraps to an AppError with the given stable code.
func requireAppErrorCode(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error with code %q, got nil", want)
	}
	_, code, ok := apperrors.AsAppError(err)
	if !ok {
		t.Fatalf("expected app error, got %v", err)
	}
	if code != want {
		t.Fatalf("expected error code %q, got %q", want, code)
	}
}

const (
	testParticipantID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	testSessionID     = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	testStageID       = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	testStageID2      = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	testPhotoID       = "11111111-1111-4111-8111-111111111111"
	testPhotoID2      = "22222222-2222-4222-8222-222222222222"
	testTenantID      = "tenant-1"
)

// newPhoto seeds a photo belonging to testParticipantID/testSessionID.
func newPhoto(id string) *entity.SmartPhoto {
	p := &entity.SmartPhoto{}
	p.ID = id
	p.ParticipantID = testParticipantID
	p.SessionID = testSessionID
	p.OriginalFileURL = "photos/" + id + ".jpg"
	return p
}

// newPickHandler builds an in-process echo + PhotoHandler over the fake repo
// (httptest, no DB/network — same pattern as tests/frame).
func newPickHandler(fake *fakePhotoRepo) (*handler.PhotoHandler, *echo.Echo) {
	e := echo.New()
	e.Validator = appmiddleware.NewValidator() // same validator the router installs
	return handler.NewPhotoHandler(fake), e
}

// TestSetReportPick_ScopeValidation: a body whose participant/session does not
// match the referenced photo is rejected with 400 validation_error and stores
// nothing; a matching body stores the pick and returns the PhotoResponse.
func TestSetReportPick_ScopeValidation(t *testing.T) {
	t.Run("mismatched participant rejected", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandler(fake)

		body := `{"participant_id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",` +
			`"session_id":"` + testSessionID + `",` +
			`"program_stage_id":"` + testStageID + `",` +
			`"photo_id":"` + testPhotoID + `"}`
		req := httptest.NewRequest(http.MethodPut, "/api/photos/report-pick", strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		if err := h.SetReportPick(c); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), `"code":"validation_error"`) {
			t.Fatalf("expected validation_error envelope, got: %s", rec.Body.String())
		}
		if len(fake.picks) != 0 {
			t.Fatalf("pick stored despite scope mismatch: %+v", fake.picks)
		}
	})

	t.Run("matching body stores pick and returns PhotoResponse", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandler(fake)

		body := `{"participant_id":"` + testParticipantID + `",` +
			`"session_id":"` + testSessionID + `",` +
			`"program_stage_id":"` + testStageID + `",` +
			`"photo_id":"` + testPhotoID + `"}`
		req := httptest.NewRequest(http.MethodPut, "/api/photos/report-pick", strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		if err := h.SetReportPick(c); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}
		// Response is dto.PhotoResponse (spec §2.1): carries the photo payload.
		if !strings.Contains(rec.Body.String(), testPhotoID) {
			t.Fatalf("response body missing photo payload: %s", rec.Body.String())
		}
		pick, ok := fake.picks[pickKey(testParticipantID, testSessionID, testStageID)]
		if !ok {
			t.Fatal("pick not stored in fake repo")
		}
		if pick.PhotoID != testPhotoID {
			t.Fatalf("stored pick photo = %q, want %q", pick.PhotoID, testPhotoID)
		}
	})
}

// TestSetReportPick_UpsertLastWins: two PUTs for the same participant+session+topic
// with different photos must collapse to ONE row holding the latest photo
// (uq_photo_pick contract, spec §5.4).
func TestSetReportPick_UpsertLastWins(t *testing.T) {
	fake := newFakePhotoRepo()
	fake.photos[testPhotoID] = newPhoto(testPhotoID)
	fake.photos[testPhotoID2] = newPhoto(testPhotoID2)
	h, e := newPickHandler(fake)

	put := func(photoID string) {
		t.Helper()
		body := `{"participant_id":"` + testParticipantID + `",` +
			`"session_id":"` + testSessionID + `",` +
			`"program_stage_id":"` + testStageID + `",` +
			`"photo_id":"` + photoID + `"}`
		req := httptest.NewRequest(http.MethodPut, "/api/photos/report-pick", strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		if err := h.SetReportPick(c); err != nil {
			t.Fatalf("SetReportPick(%s) returned error: %v", photoID, err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("SetReportPick(%s) status = %d: %s", photoID, rec.Code, rec.Body.String())
		}
	}
	put(testPhotoID)
	put(testPhotoID2)

	req := httptest.NewRequest(http.MethodGet,
		"/api/photos/report-picks?participant_id="+testParticipantID+"&session_id="+testSessionID, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	if err := h.ListReportPicks(c); err != nil {
		t.Fatalf("ListReportPicks returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("ListReportPicks status = %d: %s", rec.Code, rec.Body.String())
	}
	var payload struct {
		Data []dto.ReportPhotoPickResponse `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("cannot decode picks response %q: %v", rec.Body.String(), err)
	}
	rows := payload.Data
	if len(rows) != 1 {
		t.Fatalf("expected exactly 1 pick row (uq_photo_pick), got %d: %+v", len(rows), rows)
	}
	if rows[0].PhotoID != testPhotoID2 {
		t.Fatalf("expected last-wins photo %q, got %q", testPhotoID2, rows[0].PhotoID)
	}
}

// TestDelete_TenantGuard: deleting a photo outside the caller's tenant fails
// with not_found and never reaches DeletePhoto; the owning tenant succeeds.
func TestDelete_TenantGuard(t *testing.T) {
	t.Run("wrong tenant rejected before delete", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		fake.tenantOf[testPhotoID] = testTenantID
		h, e := newPickHandler(fake)

		req := httptest.NewRequest(http.MethodDelete, "/api/photos/"+testPhotoID, nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetPathValues(echo.PathValues{{Name: "id", Value: testPhotoID}})
		c.Set(appmiddleware.CtxTenantID, "tenant-other")

		err := h.Delete(c)
		requireAppErrorCode(t, err, "not_found")
		if fake.deletePhotoCalls != 0 {
			t.Fatalf("DeletePhoto called %d time(s) despite tenant mismatch", fake.deletePhotoCalls)
		}
		if _, stillThere := fake.photos[testPhotoID]; !stillThere {
			t.Fatal("photo removed despite tenant mismatch")
		}
	})

	t.Run("owning tenant deletes", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		fake.tenantOf[testPhotoID] = testTenantID
		h, e := newPickHandler(fake)

		req := httptest.NewRequest(http.MethodDelete, "/api/photos/"+testPhotoID, nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetPathValues(echo.PathValues{{Name: "id", Value: testPhotoID}})
		c.Set(appmiddleware.CtxTenantID, testTenantID)

		if err := h.Delete(c); err != nil {
			t.Fatalf("Delete returned error: %v", err)
		}
		if fake.deletePhotoCalls != 1 {
			t.Fatalf("DeletePhoto called %d time(s), want 1", fake.deletePhotoCalls)
		}
		if rec.Code != http.StatusNoContent {
			t.Fatalf("expected status 204, got %d", rec.Code)
		}
	})
}
