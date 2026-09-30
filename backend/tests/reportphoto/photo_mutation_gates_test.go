package reportphoto_test

// Gate tests for the §5 validation work on /api/photos/*: facilitator ownership
// with admin bypass (§5.B), consent on the pick endpoints (§5.C), tenant
// scoping (§5.A), report-pick stage validation (§5.D) and PUT body validation.
// Stdlib testing + fakes only — mirrors report_photo_handler_test.go.

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
)

// newJSONRequest builds an in-process echo context with a JSON body (or an
// empty body when body == "") and returns it together with the recorder.
func newJSONRequest(e *echo.Echo, method, target, body string) (*echo.Context, *httptest.ResponseRecorder) {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	if body != "" {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	return c, rec
}

func pickBody() string {
	return `{"participant_id":"` + testParticipantID + `",` +
		`"session_id":"` + testSessionID + `",` +
		`"program_stage_id":"` + testStageID + `",` +
		`"photo_id":"` + testPhotoID + `"}`
}

// TestOwnershipGate_PhotoMutations: a FASILITATOR may only mutate photos of
// participants in their own group (not_group_owner, pick/photo untouched);
// ADMIN bypasses the gate entirely.
func TestOwnershipGate_PhotoMutations(t *testing.T) {
	t.Run("facilitator cannot set a pick outside their group", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandler(fake)

		c, _ := newJSONRequest(e, http.MethodPut, "/api/photos/report-pick", pickBody())
		c.Set(appmiddleware.CtxRole, string(entity.RoleFasilitator))
		c.Set(appmiddleware.CtxUserID, "fac-2") // group-1 belongs to fac-1

		err := h.SetReportPick(c)
		requireAppErrorCode(t, err, "not_group_owner")
		if len(fake.picks) != 0 {
			t.Fatalf("pick stored despite ownership rejection: %+v", fake.picks)
		}
	})

	t.Run("facilitator owner may set a pick", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandler(fake)

		c, rec := newJSONRequest(e, http.MethodPut, "/api/photos/report-pick", pickBody())
		c.Set(appmiddleware.CtxRole, string(entity.RoleFasilitator))
		c.Set(appmiddleware.CtxUserID, "fac-1")

		if err := h.SetReportPick(c); err != nil {
			t.Fatalf("SetReportPick returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		if _, ok := fake.picks[pickKey(testParticipantID, testSessionID, testStageID)]; !ok {
			t.Fatal("owner's pick not stored")
		}
	})

	t.Run("admin bypasses ownership", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandler(fake)

		c, rec := newJSONRequest(e, http.MethodPut, "/api/photos/report-pick", pickBody())
		c.Set(appmiddleware.CtxRole, string(entity.RoleAdmin))
		c.Set(appmiddleware.CtxUserID, "admin-9")

		if err := h.SetReportPick(c); err != nil {
			t.Fatalf("SetReportPick returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		if _, ok := fake.picks[pickKey(testParticipantID, testSessionID, testStageID)]; !ok {
			t.Fatal("admin's pick not stored")
		}
	})

	t.Run("facilitator cannot delete a photo outside their group", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandler(fake)

		c, _ := newJSONRequest(e, http.MethodDelete, "/api/photos/"+testPhotoID, "")
		c.SetPathValues(echo.PathValues{{Name: "id", Value: testPhotoID}})
		c.Set(appmiddleware.CtxRole, string(entity.RoleFasilitator))
		c.Set(appmiddleware.CtxUserID, "fac-2")

		err := h.Delete(c)
		requireAppErrorCode(t, err, "not_group_owner")
		if fake.deletePhotoCalls != 0 {
			t.Fatalf("DeletePhoto called %d time(s) despite ownership rejection", fake.deletePhotoCalls)
		}
		if _, stillThere := fake.photos[testPhotoID]; !stillThere {
			t.Fatal("photo removed despite ownership rejection")
		}
	})
}

// TestConsentGate_PickEndpoints: set-report-photo and both report-pick
// endpoints must return 403 consent_required when the participant has not
// granted PHOTO consent (§5.C) — the same gate the upload endpoint applies.
func TestConsentGate_PickEndpoints(t *testing.T) {
	assertConsentErr := func(t *testing.T, err error) {
		t.Helper()
		requireAppErrorCode(t, err, "consent_required")
	}

	t.Run("set-report-photo without consent", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandlerWith(fake, defaultSessions(), &fakeConsentRepo{granted: false}, defaultPrograms(), t.TempDir())

		c, _ := newJSONRequest(e, http.MethodPost, "/api/photos/"+testPhotoID+"/set-report-photo", "")
		c.SetPathValues(echo.PathValues{{Name: "id", Value: testPhotoID}})

		assertConsentErr(t, h.SetReportPhoto(c))
	})

	t.Run("put report-pick without consent", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandlerWith(fake, defaultSessions(), &fakeConsentRepo{granted: false}, defaultPrograms(), t.TempDir())

		c, _ := newJSONRequest(e, http.MethodPut, "/api/photos/report-pick", pickBody())
		assertConsentErr(t, h.SetReportPick(c))
		if len(fake.picks) != 0 {
			t.Fatalf("pick stored despite missing consent: %+v", fake.picks)
		}
	})

	t.Run("delete report-pick without consent", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.picks[pickKey(testParticipantID, testSessionID, testStageID)] = entity.ReportPhotoPick{}
		h, e := newPickHandlerWith(fake, defaultSessions(), &fakeConsentRepo{granted: false}, defaultPrograms(), t.TempDir())

		target := "/api/photos/report-pick?participant_id=" + testParticipantID +
			"&session_id=" + testSessionID + "&program_stage_id=" + testStageID
		c, _ := newJSONRequest(e, http.MethodDelete, target, "")
		assertConsentErr(t, h.DeleteReportPick(c))
		if _, stillThere := fake.picks[pickKey(testParticipantID, testSessionID, testStageID)]; !stillThere {
			t.Fatal("pick deleted despite missing consent")
		}
	})
}

// TestTenantScoping_PhotoReads: list and pick reads resolve only inside the
// caller's tenant — a cross-tenant session or photo 404s (§5.A).
func TestTenantScoping_PhotoReads(t *testing.T) {
	t.Run("list photos filters by caller tenant", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		fake.tenantOf[testPhotoID] = testTenantID
		fake.photos[testPhotoID2] = newPhoto(testPhotoID2)
		fake.tenantOf[testPhotoID2] = "tenant-other"
		h, e := newPickHandler(fake)

		c, rec := newJSONRequest(e, http.MethodGet, "/api/photos", "")
		c.Set(appmiddleware.CtxTenantID, testTenantID)
		if err := h.List(c); err != nil {
			t.Fatalf("List returned error: %v", err)
		}
		body := rec.Body.String()
		if !strings.Contains(body, testPhotoID) {
			t.Fatalf("own-tenant photo missing from list: %s", body)
		}
		if strings.Contains(body, testPhotoID2) {
			t.Fatalf("cross-tenant photo leaked in list: %s", body)
		}
	})

	t.Run("list report-picks rejects cross-tenant session", func(t *testing.T) {
		sessions := defaultSessions()
		sessions.sessionTen[testSessionID] = testTenantID
		h, e := newPickHandlerWith(newFakePhotoRepo(), sessions, &fakeConsentRepo{granted: true}, defaultPrograms(), t.TempDir())

		target := "/api/photos/report-picks?participant_id=" + testParticipantID + "&session_id=" + testSessionID
		c, _ := newJSONRequest(e, http.MethodGet, target, "")
		c.Set(appmiddleware.CtxTenantID, "tenant-other")

		err := h.ListReportPicks(c)
		requireAppErrorCode(t, err, "not_found")
	})

	t.Run("delete report-pick rejects cross-tenant session before deleting", func(t *testing.T) {
		sessions := defaultSessions()
		sessions.sessionTen[testSessionID] = testTenantID
		fake := newFakePhotoRepo()
		fake.picks[pickKey(testParticipantID, testSessionID, testStageID)] = entity.ReportPhotoPick{}
		h, e := newPickHandlerWith(fake, sessions, &fakeConsentRepo{granted: true}, defaultPrograms(), t.TempDir())

		target := "/api/photos/report-pick?participant_id=" + testParticipantID +
			"&session_id=" + testSessionID + "&program_stage_id=" + testStageID
		c, _ := newJSONRequest(e, http.MethodDelete, target, "")
		c.Set(appmiddleware.CtxTenantID, "tenant-other")

		err := h.DeleteReportPick(c)
		requireAppErrorCode(t, err, "not_found")
		if _, stillThere := fake.picks[pickKey(testParticipantID, testSessionID, testStageID)]; !stillThere {
			t.Fatal("pick deleted despite cross-tenant session")
		}
	})
}

// TestSetReportPick_StageValidation: an unknown or cross-tenant
// program_stage_id is rejected with 400 validation_error and nothing is
// persisted (§5.D) — no orphan picks.
func TestSetReportPick_StageValidation(t *testing.T) {
	t.Run("unknown stage rejected", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		programs := newFakeProgramRepo() // no stages seeded
		h, e := newPickHandlerWith(fake, defaultSessions(), &fakeConsentRepo{granted: true}, programs, t.TempDir())

		c, _ := newJSONRequest(e, http.MethodPut, "/api/photos/report-pick", pickBody())
		requireAppErrorCode(t, h.SetReportPick(c), "validation_error")
		if len(fake.picks) != 0 {
			t.Fatalf("pick stored despite unknown stage: %+v", fake.picks)
		}
	})

	t.Run("cross-tenant stage rejected", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		fake.tenantOf[testPhotoID] = testTenantID
		programs := defaultPrograms()
		otherTenant := "tenant-other"
		programs.programs["program-1"] = &entity.Program{TenantID: &otherTenant}
		h, e := newPickHandlerWith(fake, defaultSessions(), &fakeConsentRepo{granted: true}, programs, t.TempDir())

		c, _ := newJSONRequest(e, http.MethodPut, "/api/photos/report-pick", pickBody())
		c.Set(appmiddleware.CtxTenantID, testTenantID)
		requireAppErrorCode(t, h.SetReportPick(c), "validation_error")
		if len(fake.picks) != 0 {
			t.Fatalf("pick stored despite cross-tenant stage: %+v", fake.picks)
		}
	})
}

// TestDelete_RemovesStoredFile: DELETE /api/photos/:id must unlink the stored
// file under UploadDir/photos/ after the row delete (§4) — no orphan files.
func TestDelete_RemovesStoredFile(t *testing.T) {
	fake := newFakePhotoRepo()
	photo := newPhoto(testPhotoID)
	fake.photos[testPhotoID] = photo

	// Upload dir seeded with the photo's stored file.
	uploadDir := t.TempDir()
	full := uploadDir + string(os.PathSeparator) + "photos" + string(os.PathSeparator) + testPhotoID + ".jpg"
	if err := os.MkdirAll(uploadDir+string(os.PathSeparator)+"photos", 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(full, []byte("jpeg-bytes"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}
	h, e := newPickHandlerWith(fake, defaultSessions(), &fakeConsentRepo{granted: true}, defaultPrograms(), uploadDir)

	c, rec := newJSONRequest(e, http.MethodDelete, "/api/photos/"+testPhotoID, "")
	c.SetPathValues(echo.PathValues{{Name: "id", Value: testPhotoID}})
	if err := h.Delete(c); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(full); !os.IsNotExist(err) {
		t.Fatalf("stored file still on disk after delete (stat err=%v)", err)
	}
	if fake.deletePhotoCalls != 1 {
		t.Fatalf("DeletePhoto called %d time(s), want 1", fake.deletePhotoCalls)
	}
}

// TestUpdate_Validation: PUT /api/photos/:id runs the validated binding and a
// strict TakenAt parse (§5.D), 404s on a missing photo before any write, and
// still succeeds for a well-formed payload.
func TestUpdate_Validation(t *testing.T) {
	t.Run("invalid frame_id rejected", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandler(fake)

		c, rec := newJSONRequest(e, http.MethodPut, "/api/photos/"+testPhotoID, `{"frame_id":"not-a-uuid"}`)
		c.SetPathValues(echo.PathValues{{Name: "id", Value: testPhotoID}})
		if err := h.Update(c); err != nil {
			t.Fatalf("Update returned error: %v", err)
		}
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("unparseable taken_at rejected", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandler(fake)

		c, rec := newJSONRequest(e, http.MethodPut, "/api/photos/"+testPhotoID, `{"taken_at":"garbage"}`)
		c.SetPathValues(echo.PathValues{{Name: "id", Value: testPhotoID}})
		if err := h.Update(c); err != nil {
			t.Fatalf("Update returned error: %v", err)
		}
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("missing photo 404s before any write", func(t *testing.T) {
		fake := newFakePhotoRepo() // empty repo
		h, e := newPickHandler(fake)

		missing := "99999999-9999-4999-8999-999999999999"
		c, _ := newJSONRequest(e, http.MethodPut, "/api/photos/"+missing, `{"taken_by":"Someone"}`)
		c.SetPathValues(echo.PathValues{{Name: "id", Value: missing}})

		err := h.Update(c)
		requireAppErrorCode(t, err, "not_found")
	})

	t.Run("well-formed update succeeds", func(t *testing.T) {
		fake := newFakePhotoRepo()
		fake.photos[testPhotoID] = newPhoto(testPhotoID)
		h, e := newPickHandler(fake)

		c, rec := newJSONRequest(e, http.MethodPut, "/api/photos/"+testPhotoID,
			`{"taken_by":"Kakak Pembimbing","taken_at":"2026-09-30T10:00:00Z"}`)
		c.SetPathValues(echo.PathValues{{Name: "id", Value: testPhotoID}})
		if err := h.Update(c); err != nil {
			t.Fatalf("Update returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}
