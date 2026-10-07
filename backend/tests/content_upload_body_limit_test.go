package auth_test

// POST /api/contents/upload (and /replace-file) must carry the same
// UPLOAD_MAX_MB-derived echo BodyLimit as the photos/frames/avatar routes —
// the "konfigurasi penyajian berkas" hardening for badge uploads. echo's
// BodyLimit rejects an oversized raw body with 413 at the Content-Length
// check BEFORE the handler parses or persists anything.
//
// The test wires the REAL content-upload route chain (JWT → role → tenant
// scope → BodyLimit → handler) exactly as RegisterUploadRoutes does, and drives
// it over httptest. Stdlib testing + in-file fakes, no DB/network (repo test convention).

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// bodyLimitContentRepo records CreateContent calls; the embedded nil interface
// makes any other method panic on use, which doubles as proof that a rejected
// request never reached the handler.
type bodyLimitContentRepo struct {
	repository.ContentRepository
	created []*entity.Content
}

func (r *bodyLimitContentRepo) CreateContent(_ context.Context, ct *entity.Content) error {
	r.created = append(r.created, ct)
	return nil
}

// bodyLimitHarness is a wired /api tree: RegisterUploadRoutes (content upload
// pair) over a real echo instance with the production middleware chain and
// error handler.
type bodyLimitHarness struct {
	e       *echo.Echo
	uploads *bodyLimitContentRepo
	token   string
}

func newBodyLimitHarness(t *testing.T) *bodyLimitHarness {
	t.Helper()

	// UploadMaxMB: 1 → uploadMaxBodyBytes expands it to 1<<20 bytes, the same
	// config source (UPLOAD_MAX_MB) the photos/frames/avatar routes use.
	cfg := &config.Config{
		JWTSecret:     "body-limit-test-secret",
		JWTAccessTTL:  time.Hour,
		JWTRefreshTTL: time.Hour,
		UploadDir:     t.TempDir(),
		UploadMaxMB:   1,
	}
	jm := auth.NewJWTManager(cfg)
	revoker := auth.NewInMemoryRevoker()
	t.Cleanup(revoker.Stop)

	// ADMIN with the tenant in the JWT and NO X-Tenant-Id header passes
	// authMW → roleMW → scopeMW (TenantScope's non-SA branch) and reaches bodyMW.
	tenantID := "tenant-body-limit"
	access, _, err := jm.Generate("user-body-limit", &tenantID, string(entity.RoleAdmin))
	if err != nil {
		t.Fatalf("generate access token: %v", err)
	}

	uploads := &bodyLimitContentRepo{}
	uploadH := handler.NewUploadHandler(cfg, nil, nil, uploads, nil, nil, nil)

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	e.HTTPErrorHandler = appmiddleware.ErrorHandler // sama seperti router produksi
	handler.RegisterUploadRoutes(e.Group("/api"), uploadH, jm, cfg, revoker)

	return &bodyLimitHarness{e: e, uploads: uploads, token: access}
}

// multipartBadgeBody builds a real multipart body whose file part is fileSize
// bytes (JPEG magic so persistFile's sniff accepts it) plus the badge form
// fields, returning the body and its boundary Content-Type. httptest.NewRequest
// derives Content-Length from the bytes.Reader, which is exactly what echo's
// BodyLimit precheck consults.
func multipartBadgeBody(t *testing.T, fileSize int) ([]byte, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, err := w.CreateFormFile("file", "badge.jpg")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	magic := []byte{0xFF, 0xD8, 0xFF}
	if _, err := fw.Write(magic); err != nil {
		t.Fatalf("write jpeg magic: %v", err)
	}
	if extra := fileSize - len(magic); extra > 0 {
		if _, err := fw.Write(make([]byte, extra)); err != nil {
			t.Fatalf("write filler: %v", err)
		}
	}
	if err := w.WriteField("title", "badge"); err != nil {
		t.Fatalf("write title: %v", err)
	}
	if err := w.WriteField("file_type", "IMAGE"); err != nil {
		t.Fatalf("write file_type: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	return buf.Bytes(), w.FormDataContentType()
}

func (h *bodyLimitHarness) post(t *testing.T, path string, body []byte, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set(echo.HeaderContentType, contentType)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+h.token)
	rec := httptest.NewRecorder()
	h.e.ServeHTTP(rec, req)
	return rec
}

// (a) Oversized upload: Content-Length above the cap → 413 from the BodyLimit
// middleware, and the handler never runs (no Content row created).
func TestContentsUpload_BodyLimitRejectsOversized(t *testing.T) {
	h := newBodyLimitHarness(t)
	//1 MiB cap + 4 KiB payload: well over even before multipart overhead.
	body, contentType := multipartBadgeBody(t, (1<<20)+4096)
	rec := h.post(t, "/api/contents/upload", body, contentType)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413 (body: %s)", rec.Code, rec.Body.String())
	}
	if len(h.uploads.created) != 0 {
		t.Fatalf("oversized upload reached CreateContent (%d rows)", len(h.uploads.created))
	}
}

// (b) The limit is not a blanket rejection: an under-limit upload flows through
// the SAME chain, persists the file and creates the Content row.
func TestContentsUpload_UnderLimitSucceeds(t *testing.T) {
	h := newBodyLimitHarness(t)
	body, contentType := multipartBadgeBody(t, 64)
	rec := h.post(t, "/api/contents/upload", body, contentType)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (body: %s)", rec.Code, rec.Body.String())
	}
	if len(h.uploads.created) != 1 {
		t.Fatalf("CreateContent calls = %d, want 1", len(h.uploads.created))
	}
	got := h.uploads.created[0]
	if got.FileType != entity.StageContentImage {
		t.Fatalf("file_type = %q, want IMAGE", got.FileType)
	}
	if len(got.FileURL) == 0 {
		t.Fatal("created content has empty file_url (file not persisted)")
	}
}

// (c) POST /api/contents/:id/replace-file is a multipart upload route too —
// it carries the SAME BodyLimit, so an oversized replacement 413s before the
// handler looks up the content row.
func TestContentsReplaceFile_BodyLimitRejectsOversized(t *testing.T) {
	h := newBodyLimitHarness(t)
	body, contentType := multipartBadgeBody(t, (1<<20)+4096)
	rec := h.post(t, "/api/contents/99999999-9999-4999-8999-999999999999/replace-file", body, contentType)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413 (body: %s)", rec.Code, rec.Body.String())
	}
	if len(h.uploads.created) != 0 {
		t.Fatalf("oversized replace reached the handler (%d creates)", len(h.uploads.created))
	}
}
