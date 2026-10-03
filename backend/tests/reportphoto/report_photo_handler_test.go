package reportphoto_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
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
	// lastListFilter records the filter of the most recent ListPhotos call —
	// the topic-param presence semantics of GET /api/photos are asserted on it.
	lastListFilter repository.PhotoFilter
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
	f.lastListFilter = filt
	out := make([]entity.SmartPhoto, 0, len(f.photos))
	for _, p := range f.photos {
		if filt.TenantID != "" && f.tenantOf[p.ID] != filt.TenantID {
			continue
		}
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
	// Session stages (topics) instantiating testStageID/testStageID2 inside
	// testSessionID — the upload/pick topic checks resolve through them.
	testSessionStageID  = "99999999-9999-4999-8999-999999999999"
	testSessionStageID2 = "88888888-8888-4888-8888-888888888888"
)

// newPhoto seeds a photo belonging to testParticipantID/testSessionID, topic
// testSessionStageID (the session stage of testStageID).
func newPhoto(id string) *entity.SmartPhoto {
	p := &entity.SmartPhoto{}
	p.ID = id
	p.ParticipantID = testParticipantID
	p.SessionID = testSessionID
	p.SessionStageID = testSessionStageID
	p.OriginalFileURL = "photos/" + id + ".jpg"
	return p
}

// ---------------------------------------------------------------------------
// fakeSessionRepo is an in-memory sessionScope: the session/participant/group
// reads behind the tenant and facilitator-ownership checks (§5.A/§5.B).
// ---------------------------------------------------------------------------

type fakeSessionRepo struct {
	sessions     map[string]*entity.Session       // sessionID -> session
	sessionTen   map[string]string                // sessionID -> owning tenant ("" = unscoped)
	participants map[string]*entity.Participant   // participantID -> participant
	groupOwners  map[string]*string               // groupID -> facilitatorID (nil = unassigned)
	stages       map[string][]entity.SessionStage // sessionID -> session stages (topics)
}

func newFakeSessionRepo() *fakeSessionRepo {
	return &fakeSessionRepo{
		sessions:     map[string]*entity.Session{},
		sessionTen:   map[string]string{},
		participants: map[string]*entity.Participant{},
		groupOwners:  map[string]*string{},
		stages:       map[string][]entity.SessionStage{},
	}
}

// ListSessionStages feeds the upload stage-membership check, the pick topic
// check, and topic-true photo resolution (sessionScope slice).
func (f *fakeSessionRepo) ListSessionStages(_ context.Context, sessionID string) ([]entity.SessionStage, error) {
	return f.stages[sessionID], nil // absent session → empty list (no topic matches)
}

func (f *fakeSessionRepo) GetSessionByID(_ context.Context, id, tenantID string) (*entity.Session, error) {
	s, ok := f.sessions[id]
	if !ok || (tenantID != "" && f.sessionTen[id] != tenantID) {
		return nil, apperrors.NotFound("not_found", nil)
	}
	return s, nil
}

func (f *fakeSessionRepo) GetParticipantByID(_ context.Context, id, tenantID string) (*entity.Participant, error) {
	p, ok := f.participants[id]
	if !ok {
		return nil, apperrors.NotFound("not_found", nil)
	}
	if tenantID != "" && (p.TenantID == nil || *p.TenantID != tenantID) {
		return nil, apperrors.NotFound("not_found", nil)
	}
	return p, nil
}

func (f *fakeSessionRepo) GetGroupFacilitatorID(_ context.Context, groupID string) (*string, error) {
	owner, ok := f.groupOwners[groupID]
	if !ok {
		return nil, apperrors.NotFound("not_found", nil)
	}
	return owner, nil
}

// fakeConsentRepo is an in-memory consentScope (§5.C gates).
type fakeConsentRepo struct{ granted bool }

func (f *fakeConsentRepo) GetConsentValue(context.Context, string, string, entity.ConsentType) (bool, error) {
	return f.granted, nil
}

// fakeProgramRepo is an in-memory programScope: stage -> program tenant chain
// used to validate a report pick's program_stage_id (§5.D).
type fakeProgramRepo struct {
	stages   map[string]*entity.ProgramStage
	programs map[string]*entity.Program
}

func newFakeProgramRepo() *fakeProgramRepo {
	return &fakeProgramRepo{
		stages:   map[string]*entity.ProgramStage{},
		programs: map[string]*entity.Program{},
	}
}

func (f *fakeProgramRepo) GetStageByID(_ context.Context, id string) (*entity.ProgramStage, error) {
	s, ok := f.stages[id]
	if !ok {
		return nil, apperrors.NotFound("not_found", nil)
	}
	return s, nil
}

func (f *fakeProgramRepo) GetProgramByID(_ context.Context, id string) (*entity.Program, error) {
	p, ok := f.programs[id]
	if !ok {
		return nil, apperrors.NotFound("not_found", nil)
	}
	return p, nil
}

// defaultSessions seeds the passing path: the test session is unscoped, the
// test participant sits in group-1 owned by facilitator "fac-1".
func defaultSessions() *fakeSessionRepo {
	s := newFakeSessionRepo()
	sess := &entity.Session{}
	sess.ID = testSessionID
	s.sessions[testSessionID] = sess

	part := &entity.Participant{}
	part.ID = testParticipantID
	tenant := testTenantID
	part.TenantID = &tenant
	gid := "group-1"
	part.GroupID = &gid
	s.participants[testParticipantID] = part

	owner := "fac-1"
	s.groupOwners[gid] = &owner

	// Topics: the session instantiates both test program stages.
	st1 := entity.SessionStage{ProgramStageID: testStageID, SessionID: testSessionID}
	st1.ID = testSessionStageID
	st2 := entity.SessionStage{ProgramStageID: testStageID2, SessionID: testSessionID}
	st2.ID = testSessionStageID2
	s.stages[testSessionID] = []entity.SessionStage{st1, st2}
	return s
}

// defaultPrograms seeds both test stages under program-1 (no tenant -> the
// stage check passes whenever the caller tenant is unset).
func defaultPrograms() *fakeProgramRepo {
	p := newFakeProgramRepo()
	for _, sid := range []string{testStageID, testStageID2} {
		st := &entity.ProgramStage{ProgramID: "program-1"}
		st.ID = sid
		p.stages[sid] = st
	}
	p.programs["program-1"] = &entity.Program{}
	return p
}

// newPickHandlerWith builds the handler over explicit fakes plus an in-process
// echo (httptest, no DB/network).
func newPickHandlerWith(
	fake *fakePhotoRepo,
	sessions *fakeSessionRepo,
	consent *fakeConsentRepo,
	programs *fakeProgramRepo,
	uploadDir string,
) (*handler.PhotoHandler, *echo.Echo) {
	e := echo.New()
	e.Validator = appmiddleware.NewValidator() // same validator the router installs
	h := handler.NewPhotoHandler(fake, sessions, consent, programs, &config.Config{UploadDir: uploadDir})
	return h, e
}

// newPickHandler builds an in-process echo + PhotoHandler over the fake repo
// with passing tenant/ownership/consent/stage defaults (the scenario tests
// below override the context or fakes where they exercise a specific gate).
func newPickHandler(fake *fakePhotoRepo) (*handler.PhotoHandler, *echo.Echo) {
	return newPickHandlerWith(fake, defaultSessions(), &fakeConsentRepo{granted: true}, defaultPrograms(), os.TempDir())
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

// TestSetReportPick_TopicTruth: a NEW pick must be topic-true (migration
// 000009) — the photo's session_stage must resolve to the pick's program stage
// within the same session. A photo captured under ANOTHER topic, or a legacy
// photo without a topic (”), is rejected with 400 validation_error and stores
// nothing; a photo of the matching topic is accepted.
func TestSetReportPick_TopicTruth(t *testing.T) {
	put := func(t *testing.T, fake *fakePhotoRepo, photoID, programStageID string) *httptest.ResponseRecorder {
		t.Helper()
		h, e := newPickHandler(fake)
		body := `{"participant_id":"` + testParticipantID + `",` +
			`"session_id":"` + testSessionID + `",` +
			`"program_stage_id":"` + programStageID + `",` +
			`"photo_id":"` + photoID + `"}`
		req := httptest.NewRequest(http.MethodPut, "/api/photos/report-pick", strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		if err := h.SetReportPick(c); err != nil {
			t.Fatalf("SetReportPick returned error: %v", err)
		}
		return rec
	}

	t.Run("photo of a different topic is rejected", func(t *testing.T) {
		fake := newFakePhotoRepo()
		other := newPhoto(testPhotoID2)
		other.SessionStageID = testSessionStageID2 // topic of testStageID2
		fake.photos[testPhotoID2] = other

		rec := put(t, fake, testPhotoID2, testStageID)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400 (body: %s)", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), `"code":"validation_error"`) {
			t.Fatalf("expected validation_error envelope, got: %s", rec.Body.String())
		}
		if len(fake.picks) != 0 {
			t.Fatalf("cross-topic pick stored: %+v", fake.picks)
		}
	})

	t.Run("legacy photo without topic is rejected", func(t *testing.T) {
		fake := newFakePhotoRepo()
		legacy := newPhoto(testPhotoID)
		legacy.SessionStageID = "" // 000009 sentinel: topic unknown
		fake.photos[testPhotoID] = legacy

		rec := put(t, fake, testPhotoID, testStageID)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400 (body: %s)", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), `"code":"validation_error"`) {
			t.Fatalf("expected validation_error envelope, got: %s", rec.Body.String())
		}
		if len(fake.picks) != 0 {
			t.Fatalf("pick stored on a legacy no-topic photo: %+v", fake.picks)
		}
	})

	t.Run("photo of the matching topic is accepted", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID) // stage testSessionStageID → testStageID

		rec := put(t, fake, testPhotoID, testStageID)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
		}
		if _, ok := fake.picks[pickKey(testParticipantID, testSessionID, testStageID)]; !ok {
			t.Fatal("topic-true pick not stored")
		}
	})
}
