package reportphoto_test

// Upload validation tests for POST /api/photos/upload (§5.A/§5.D): every form
// ID is UUID-validated, a missing participant is 400 (not 500), an explicit
// empty session_id is rejected, and a cross-tenant session 404s before any
// file is persisted. Stdlib testing + fakes; the invalid paths return before
// disk I/O, so no upload directory is touched.

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// uploadConsentRepo satisfies the full repository.ConsentRepository required by
// NewUploadHandler; the embedded nil interface covers the methods the rejected
// paths under test never call.
type uploadConsentRepo struct {
	repository.ConsentRepository
}

func (uploadConsentRepo) GetConsentValue(context.Context, string, string, entity.ConsentType) (bool, error) {
	return true, nil
}

// newUpload builds an UploadHandler over the fakes. frames/content/users are
// unused on the rejected paths under test (validation happens first), so nil
// is safe.
func newUpload(
	photos *fakePhotoRepo,
	sessions *fakeSessionRepo,
	uploadDir string,
) *handler.UploadHandler {
	return handler.NewUploadHandler(
		&config.Config{UploadDir: uploadDir},
		photos, nil, nil, nil, uploadConsentRepo{}, sessions,
	)
}

// newMultipartRequest builds a multipart/form-data POST context for the upload
// handler and returns it with the recorder.
func newMultipartRequest(e *echo.Echo, fields map[string]string) (*echo.Context, *httptest.ResponseRecorder) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	_ = w.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/photos/upload", &buf)
	req.Header.Set(echo.HeaderContentType, w.FormDataContentType())
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	return c, rec
}

func uploadEcho() *echo.Echo {
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	return e
}

// TestUpload_FormValidation: malformed/missing form IDs fail fast with 400
// validation_error and never create a photo row.
func TestUpload_FormValidation(t *testing.T) {
	cases := []struct {
		name   string
		fields map[string]string
	}{
		{
			name: "non-uuid participant_id",
			fields: map[string]string{
				"participant_id": "not-a-uuid",
				"session_id":     testSessionID,
			},
		},
		{
			name: "missing participant_id",
			fields: map[string]string{
				"session_id": testSessionID,
			},
		},
		{
			name: "missing session_id",
			fields: map[string]string{
				"participant_id": testParticipantID,
			},
		},
		{
			name: "non-uuid frame_id",
			fields: map[string]string{
				"participant_id": testParticipantID,
				"session_id":     testSessionID,
				"frame_id":       "nope",
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			photos := newFakePhotoRepo()
			h := newUpload(photos, defaultSessions(), t.TempDir())
			c, rec := newMultipartRequest(uploadEcho(), tc.fields)

			if err := h.UploadPhoto(c); err != nil {
				t.Fatalf("UploadPhoto returned error: %v", err)
			}
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
			}
			if len(photos.photos) != 0 {
				t.Fatalf("photo row created despite invalid form: %+v", photos.photos)
			}
		})
	}
}

// TestUpload_NonexistentParticipantIs400: a well-formed but unknown
// participant_id is client input — 400 validation_error, never a 500.
func TestUpload_NonexistentParticipantIs400(t *testing.T) {
	photos := newFakePhotoRepo()
	sessions := newFakeSessionRepo() // no participants seeded
	h := newUpload(photos, sessions, t.TempDir())
	c, rec := newMultipartRequest(uploadEcho(), map[string]string{
		"participant_id": testParticipantID,
		"session_id":     testSessionID,
	})

	if err := h.UploadPhoto(c); err != nil {
		t.Fatalf("UploadPhoto returned error: %v (500s must surface as 400)", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(photos.photos) != 0 {
		t.Fatalf("photo row created for nonexistent participant: %+v", photos.photos)
	}
}

// TestUpload_CrossTenantSessionRejected: the session must belong to the
// caller's tenant (§5.A) — a cross-tenant session 404s before any write.
func TestUpload_CrossTenantSessionRejected(t *testing.T) {
	photos := newFakePhotoRepo()
	sessions := defaultSessions()
	sessions.sessionTen[testSessionID] = "tenant-owner" // session lives elsewhere
	h := newUpload(photos, sessions, t.TempDir())

	c, _ := newMultipartRequest(uploadEcho(), map[string]string{
		"participant_id": testParticipantID,
		"session_id":     testSessionID,
	})
	c.Set(appmiddleware.CtxTenantID, testTenantID)

	err := h.UploadPhoto(c)
	requireAppErrorCode(t, err, "not_found")
	if len(photos.photos) != 0 {
		t.Fatalf("photo row created for cross-tenant session: %+v", photos.photos)
	}
}

// newMultipartRequestWithFile mirrors newMultipartRequest but optionally adds
// a "file" part with the given raw content (nil = no file part at all).
func newMultipartRequestWithFile(e *echo.Echo, fields map[string]string, fileBody []byte) (*echo.Context, *httptest.ResponseRecorder) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	if fileBody != nil {
		fw, err := w.CreateFormFile("file", "upload.bin")
		if err != nil {
			panic(err)
		}
		if _, err := fw.Write(fileBody); err != nil {
			panic(err)
		}
	}
	_ = w.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/photos/upload", &buf)
	req.Header.Set(echo.HeaderContentType, w.FormDataContentType())
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	return c, rec
}

// TestUpload_FileValidationGates: every persistFile rejection (missing file
// part, empty file, disallowed magic bytes) must STOP the handler — no photo
// row is ever created — and surface as an AppError whose ErrorHandler envelope
// carries the exact status/code/message the endpoint always returned.
func TestUpload_FileValidationGates(t *testing.T) {
	cases := []struct {
		name       string
		fileBody   []byte // nil = omit the file part entirely
		wantStatus int
		wantCode   string
		wantMsg    string
	}{
		{
			name:       "missing file part",
			fileBody:   nil,
			wantStatus: http.StatusBadRequest,
			wantCode:   "invalid_body",
			wantMsg:    "Format permintaan tidak valid",
		},
		{
			name:       "empty file",
			fileBody:   []byte{},
			wantStatus: http.StatusBadRequest,
			wantCode:   "invalid_file",
			wantMsg:    "file kosong",
		},
		{
			name:       "disallowed content type",
			fileBody:   []byte("<html><body>not media</body></html>"),
			wantStatus: http.StatusUnsupportedMediaType,
			wantCode:   "file_type_unsupported",
			wantMsg:    "Tipe berkas tidak diizinkan",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			photos := newFakePhotoRepo()
			h := newUpload(photos, defaultSessions(), t.TempDir())
			c, rec := newMultipartRequestWithFile(uploadEcho(), map[string]string{
				"participant_id": testParticipantID,
				"session_id":     testSessionID,
			}, tc.fileBody)

			err := h.UploadPhoto(c)
			requireAppErrorCode(t, err, tc.wantCode)
			if len(photos.photos) != 0 {
				t.Fatalf("photo row created despite %s: %+v", tc.name, photos.photos)
			}

			// Mirror the router: ErrorHandler renders the returned AppError.
			appmiddleware.ErrorHandler(c, err)
			if rec.Code != tc.wantStatus {
				t.Fatalf("expected status %d, got %d: %s", tc.wantStatus, rec.Code, rec.Body.String())
			}
			body := rec.Body.String()
			if !strings.Contains(body, `"code":"`+tc.wantCode+`"`) {
				t.Fatalf("expected code %q in envelope, got: %s", tc.wantCode, body)
			}
			if !strings.Contains(body, `"message":"`+tc.wantMsg+`"`) {
				t.Fatalf("expected message %q in envelope, got: %s", tc.wantMsg, body)
			}
			if !json.Valid(rec.Body.Bytes()) {
				t.Fatalf("envelope is not a single valid JSON value (appended write?): %s", body)
			}
		})
	}
}
