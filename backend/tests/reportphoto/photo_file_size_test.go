package reportphoto_test

// Requirement K (sort gallery by photo size): the multipart-provided byte size
// must be stored on the created SmartPhoto and exposed in photo JSON — both in
// the upload response and in GET /api/photos list items. Legacy rows without a
// recorded size serialize as JSON null (never 0). Stdlib testing + fakes, no DB.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// jpegBody builds a body of exactly n bytes that passes the magic-byte sniff
// as JPEG (FF D8 FF) — required for persistFile to accept the upload.
func jpegBody(n int) []byte {
	b := make([]byte, n)
	b[0], b[1], b[2] = 0xFF, 0xD8, 0xFF
	return b
}

// TestUpload_RecordsMultipartFileSize: a successful upload stores the exact
// byte count of the multipart file on the SmartPhoto row, reports it in the
// 201 JSON as "file_size", and the file on disk keeps its raw size (no
// re-encoding).
func TestUpload_RecordsMultipartFileSize(t *testing.T) {
	const wantSize = 4096
	body := jpegBody(wantSize)
	uploadDir := t.TempDir()

	photos := newFakePhotoRepo()
	h := newUpload(photos, defaultSessions(), uploadDir)
	c, rec := newMultipartRequestWithFile(uploadEcho(), map[string]string{
		"participant_id":   testParticipantID,
		"session_id":       testSessionID,
		"session_stage_id": testSessionStageID,
	}, body)

	if err := h.UploadPhoto(c); err != nil {
		t.Fatalf("UploadPhoto returned error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(photos.photos) != 1 {
		t.Fatalf("expected 1 stored photo, got %d", len(photos.photos))
	}
	var stored *entity.SmartPhoto
	for _, p := range photos.photos {
		stored = p
	}
	if stored.FileSize == nil {
		t.Fatal("stored SmartPhoto has nil file_size after upload")
	}
	if *stored.FileSize != wantSize {
		t.Fatalf("stored file_size = %d, want %d", *stored.FileSize, wantSize)
	}

	// The stored file must keep the raw uploaded bytes (upload stores via
	// io.Copy — no compression/quality reduction).
	fi, err := os.Stat(filepath.Join(uploadDir, filepath.FromSlash(stored.OriginalFileURL)))
	if err != nil {
		t.Fatalf("stored file not found: %v", err)
	}
	if fi.Size() != wantSize {
		t.Fatalf("stored file on disk = %d bytes, want %d (re-encoded?)", fi.Size(), wantSize)
	}

	// The upload response envelope must carry file_size as that exact number.
	var env struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("response is not a JSON object: %v (%s)", err, rec.Body.String())
	}
	var created map[string]json.RawMessage
	if err := json.Unmarshal(env.Data, &created); err != nil {
		t.Fatalf("response data is not a JSON object: %v (%s)", err, rec.Body.String())
	}
	raw, ok := created["file_size"]
	if !ok {
		t.Fatalf("upload response missing file_size: %s", rec.Body.String())
	}
	var got int64
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("file_size is not a number: %v (%s)", err, string(raw))
	}
	if got != wantSize {
		t.Fatalf("upload response file_size = %d, want %d", got, wantSize)
	}
}

// TestList_FileSizeContract: GET /api/photos list items must expose file_size —
// the recorded byte size for a new photo, and explicit JSON null for a legacy
// row that predates size tracking (nil pointer, never 0 or a missing key).
func TestList_FileSizeContract(t *testing.T) {
	const wantSize = 12345

	fake := newFakePhotoRepo()
	withSize := newPhoto(testPhotoID)
	withSize.FileSize = func() *int64 { v := int64(wantSize); return &v }()
	legacy := newPhoto(testPhotoID2) // legacy row: FileSize stays nil
	fake.photos[withSize.ID] = withSize
	fake.photos[legacy.ID] = legacy

	h, e := newPickHandler(fake)
	req := httptest.NewRequest(http.MethodGet, "/api/photos", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	if err := h.List(c); err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var env struct {
		Data struct {
			Items []map[string]json.RawMessage `json:"items"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("list response is not a JSON object: %v (%s)", err, rec.Body.String())
	}
	if len(env.Data.Items) != 2 {
		t.Fatalf("expected 2 list items, got %d", len(env.Data.Items))
	}

	byID := map[string]map[string]json.RawMessage{}
	for _, item := range env.Data.Items {
		var id string
		if err := json.Unmarshal(item["id"], &id); err != nil {
			t.Fatalf("list item has no id: %v (%s)", err, rec.Body.String())
		}
		byID[id] = item
	}

	// New photo: file_size present and equal to the recorded byte size.
	item, ok := byID[testPhotoID]
	if !ok {
		t.Fatalf("photo %s missing from list items: %s", testPhotoID, rec.Body.String())
	}
	raw, ok := item["file_size"]
	if !ok {
		t.Fatalf("list item missing file_size key: %s", rec.Body.String())
	}
	var got int64
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("file_size is not a number: %v (%s)", err, string(raw))
	}
	if got != wantSize {
		t.Fatalf("list item file_size = %d, want %d", got, wantSize)
	}

	// Legacy row: file_size key present and explicitly null.
	legacyItem, ok := byID[testPhotoID2]
	if !ok {
		t.Fatalf("legacy photo %s missing from list items: %s", testPhotoID2, rec.Body.String())
	}
	legacyRaw, ok := legacyItem["file_size"]
	if !ok {
		t.Fatalf("legacy list item missing file_size key: %s", rec.Body.String())
	}
	if string(legacyRaw) != "null" {
		t.Fatalf("legacy list item file_size = %s, want null", string(legacyRaw))
	}
}
