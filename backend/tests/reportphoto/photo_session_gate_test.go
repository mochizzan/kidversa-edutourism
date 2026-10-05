package reportphoto_test

// Session-status gates for the photo write paths (audit #13): upload and the
// report-pick endpoints refuse a CANCELLED session with session_not_active
// before anything is persisted. Only CANCELLED rejects — every other status
// keeps the pre-audit behavior (covered by the existing tests over
// defaultSessions, whose status is "").

import (
	"net/http"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/domain/entity"
)

func cancelledSessions() *fakeSessionRepo {
	s := defaultSessions()
	s.sessions[testSessionID].Status = entity.SessionCancelled
	return s
}

// TestUpload_SessionCancelled_Rejected: no photo row is created and no file is
// persisted for a cancelled session.
func TestUpload_SessionCancelled_Rejected(t *testing.T) {
	photos := newFakePhotoRepo()
	h := newUpload(photos, cancelledSessions(), t.TempDir())

	fields := map[string]string{
		"participant_id":   testParticipantID,
		"session_id":       testSessionID,
		"session_stage_id": testSessionStageID,
	}
	c, _ := newMultipartRequestWithFile(uploadEcho(), fields, jpegBody(64))
	requireAppErrorCode(t, h.UploadPhoto(c), "session_not_active")

	if len(photos.photos) != 0 {
		t.Fatalf("photo row created despite cancelled session: %+v", photos.photos)
	}
}

// TestSetReportPhoto_SessionCancelled_Rejected: the exclusive report-photo flag
// never flips on a cancelled session.
func TestSetReportPhoto_SessionCancelled_Rejected(t *testing.T) {
	fake := newFakePhotoRepo()
	fake.photos[testPhotoID] = newPhoto(testPhotoID)
	h, e := newPickHandlerWith(fake, cancelledSessions(), &fakeConsentRepo{granted: true}, defaultPrograms(), t.TempDir())

	c, _ := newJSONRequest(e, http.MethodPost, "/api/photos/"+testPhotoID+"/set-report-photo", "")
	c.SetPathValues(echo.PathValues{{Name: "id", Value: testPhotoID}})

	requireAppErrorCode(t, h.SetReportPhoto(c), "session_not_active")
}

// TestSetReportPick_SessionCancelled_Rejected: no pick row is upserted on a
// cancelled session.
func TestSetReportPick_SessionCancelled_Rejected(t *testing.T) {
	fake := newFakePhotoRepo()
	fake.photos[testPhotoID] = newPhoto(testPhotoID)
	h, e := newPickHandlerWith(fake, cancelledSessions(), &fakeConsentRepo{granted: true}, defaultPrograms(), t.TempDir())

	c, _ := newJSONRequest(e, http.MethodPut, "/api/photos/report-pick", pickBody())
	requireAppErrorCode(t, h.SetReportPick(c), "session_not_active")

	if len(fake.picks) != 0 {
		t.Fatalf("pick stored despite cancelled session: %+v", fake.picks)
	}
}

// TestDeleteReportPick_SessionCancelled_Rejected: the pick survives — clearing
// it is a write too.
func TestDeleteReportPick_SessionCancelled_Rejected(t *testing.T) {
	fake := newFakePhotoRepo()
	fake.picks[pickKey(testParticipantID, testSessionID, testStageID)] = entity.ReportPhotoPick{}
	h, e := newPickHandlerWith(fake, cancelledSessions(), &fakeConsentRepo{granted: true}, defaultPrograms(), t.TempDir())

	target := "/api/photos/report-pick?participant_id=" + testParticipantID +
		"&session_id=" + testSessionID + "&program_stage_id=" + testStageID
	c, _ := newJSONRequest(e, http.MethodDelete, target, "")
	requireAppErrorCode(t, h.DeleteReportPick(c), "session_not_active")

	if _, stillThere := fake.picks[pickKey(testParticipantID, testSessionID, testStageID)]; !stillThere {
		t.Fatal("pick cleared despite cancelled session")
	}
}

// TestPhotoWrites_NonCancelledSession_Allowed pins the deviation contract: an
// ACTIVE session keeps accepting picks (the existing suite covers "" status;
// ACTIVE is the other live write state).
func TestPhotoWrites_NonCancelledSession_Allowed(t *testing.T) {
	sessions := defaultSessions()
	sessions.sessions[testSessionID].Status = entity.SessionActive
	fake := newFakePhotoRepo()
	fake.photos[testPhotoID] = newPhoto(testPhotoID)
	h, e := newPickHandlerWith(fake, sessions, &fakeConsentRepo{granted: true}, defaultPrograms(), t.TempDir())

	c, _ := newJSONRequest(e, http.MethodPut, "/api/photos/report-pick", pickBody())
	if err := h.SetReportPick(c); err != nil {
		t.Fatalf("SetReportPick on ACTIVE session = %v, want success", err)
	}
	if len(fake.picks) != 1 {
		t.Fatalf("picks = %d, want 1", len(fake.picks))
	}
}
