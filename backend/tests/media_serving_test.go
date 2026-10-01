package auth_test

// Media serving tests for GET /api/media/content/:id — the tenant-resolution
// contract for kind=content (badge/standalone content regression):
//   - the content row's own tenant_id (stamped at upload) is the PRIMARY
//     owning-tenant source, so unassigned badge images serve 200;
//   - legacy rows (empty tenant_id) fall back to GetContentProgramTenant
//     (stage's program join) — the CRIT-6 gate for unscoped content;
//   - neither source resolves a tenant -> 404 not_found;
//   - resolved tenant != caller tenant -> 403 forbidden.
// stdlib testing only; in-file fakes per repo test convention (no DB/network).

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

const (
	mediaContentID = "99999999-9999-4999-8999-999999999999"
	mediaTenantA   = "tenant-media-a"
	mediaTenantB   = "tenant-media-b"
	// mediaRelPath mirrors the upload layout: UploadContentFile stores under "contents".
	mediaRelPath = "contents/badge.png"
)

// mediaPNGBytes is the byte payload streamed back on the success path; the
// handler only checks the extension, but the magic header keeps it realistic.
var mediaPNGBytes = []byte("\x89PNG\r\n\x1a\nkidversa-media-test-bytes")

// ---------------------------------------------------------------------------
// Fakes: only the methods the kind=content path calls are implemented; the
// embedded nil interfaces make any other method panic on use (repo test
// convention — accidental use fails loudly).
// ---------------------------------------------------------------------------

type mediaContentRepo struct {
	repository.ContentRepository
	content       *entity.Content
	programTenant string // join result returned by GetContentProgramTenant
	programCalls  int    // times GetContentProgramTenant was consulted
}

func (f *mediaContentRepo) GetContentByID(_ context.Context, id string) (*entity.Content, error) {
	if f.content == nil || f.content.ID != id {
		return nil, apperrors.NotFound("not_found", nil)
	}
	clone := *f.content
	return &clone, nil
}

func (f *mediaContentRepo) GetContentProgramTenant(_ context.Context, _ string) (string, error) {
	f.programCalls++
	return f.programTenant, nil
}

// The remaining repositories are never touched by kind=content requests; they
// exist only to satisfy NewMediaHandler's signature.
type mediaPhotoRepo struct{ repository.PhotoRepository }
type mediaConsentRepo struct{ repository.ConsentRepository }
type mediaSessionRepo struct{ repository.SessionRepository }
type mediaFrameRepo struct{ repository.FrameRepository }
type mediaUserRepo struct{ repository.UserRepository }

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

// newMediaContent builds the content row under test: a badge-style standalone
// asset referencing mediaRelPath inside the upload dir, owned by tenantID.
func newMediaContent(tenantID string) *entity.Content {
	ct := &entity.Content{TenantID: tenantID, FileURL: mediaRelPath}
	ct.ID = mediaContentID
	return ct
}

// runMediaGet performs GET /api/media/content/:id against a fresh MediaHandler
// over a temp upload dir (seeded with mediaPNGBytes when seedFile), with
// callerTenant set on the echo context exactly the way TenantScope/JWTAuth set
// it. Fails the test if the handler returns an error (the Fail envelope is
// written to the recorder instead).
func runMediaGet(t *testing.T, content *mediaContentRepo, callerTenant string, seedFile bool) *httptest.ResponseRecorder {
	t.Helper()

	uploadDir := t.TempDir()
	if seedFile {
		dest := filepath.Join(uploadDir, filepath.FromSlash(mediaRelPath))
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			t.Fatalf("create upload subdir: %v", err)
		}
		if err := os.WriteFile(dest, mediaPNGBytes, 0o644); err != nil {
			t.Fatalf("seed media file: %v", err)
		}
	}

	h := handler.NewMediaHandler(
		&config.Config{UploadDir: uploadDir},
		&mediaPhotoRepo{},
		&mediaConsentRepo{},
		&mediaSessionRepo{},
		&mediaFrameRepo{},
		content,
		&mediaUserRepo{},
	)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/media/content/"+mediaContentID, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{
		{Name: "kind", Value: "content"},
		{Name: "id", Value: mediaContentID},
	})
	c.Set(appmiddleware.CtxTenantID, callerTenant)

	if err := h.Get(c); err != nil {
		t.Fatalf("MediaHandler.Get returned error: %v", err)
	}
	return rec
}

// requireMediaFail asserts the recorder carries the fail envelope for status/code.
func requireMediaFail(t *testing.T, rec *httptest.ResponseRecorder, wantStatus int, wantCode string) {
	t.Helper()
	if rec.Code != wantStatus {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, wantStatus, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"code":"`+wantCode+`"`) {
		t.Fatalf("body missing code %q: %s", wantCode, rec.Body.String())
	}
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

// (a) Badge bug: content carries TenantID=T and the caller is T, but the row is
// NOT assigned to any stage (program join returns ""). Pre-fix this served 404
// because only the join was consulted; the row tenant must win and the join
// must not be consulted at all.
func TestMediaContent_RowTenantServesUnassignedBadge(t *testing.T) {
	content := &mediaContentRepo{content: newMediaContent(mediaTenantA), programTenant: ""}
	rec := runMediaGet(t, content, mediaTenantA, true)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
	}
	if !bytes.Equal(rec.Body.Bytes(), mediaPNGBytes) {
		t.Fatalf("body = %q, want file bytes %q", rec.Body.Bytes(), mediaPNGBytes)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "image/png") {
		t.Fatalf("content-type = %q, want image/png", ct)
	}
	if content.programCalls != 0 {
		t.Fatalf("GetContentProgramTenant called %d time(s); row tenant must be the primary source", content.programCalls)
	}
}

// (b) Legacy row: empty row tenant falls back to the stage-program join, which
// resolves T for caller T -> 200. Pre-fix this returned 403 (the join result
// shadowed the outer owningTenant, so the post-switch check saw "").
func TestMediaContent_LegacyRowFallsBackToProgramTenant(t *testing.T) {
	content := &mediaContentRepo{content: newMediaContent(""), programTenant: mediaTenantA}
	rec := runMediaGet(t, content, mediaTenantA, true)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
	}
	if !bytes.Equal(rec.Body.Bytes(), mediaPNGBytes) {
		t.Fatalf("body = %q, want file bytes %q", rec.Body.Bytes(), mediaPNGBytes)
	}
	if content.programCalls != 1 {
		t.Fatalf("GetContentProgramTenant called %d time(s), want exactly 1 fallback", content.programCalls)
	}
}

// (c) Preservation (CRIT-6): empty row tenant AND empty join result -> no
// tenant is resolvable -> 404 not_found, caller tenant irrelevant.
func TestMediaContent_UnassignedUnscopedContentNotFound(t *testing.T) {
	content := &mediaContentRepo{content: newMediaContent(""), programTenant: ""}
	rec := runMediaGet(t, content, mediaTenantA, true)

	requireMediaFail(t, rec, http.StatusNotFound, "not_found")
	if content.programCalls != 1 {
		t.Fatalf("GetContentProgramTenant called %d time(s), want exactly 1 fallback", content.programCalls)
	}
}

// (d) Tenant mismatch: row tenant T, caller T2 -> 403 forbidden (pre-fix this
// surfaced as 404 because the row tenant was ignored and the join returned "").
func TestMediaContent_RowTenantMismatchForbidden(t *testing.T) {
	content := &mediaContentRepo{content: newMediaContent(mediaTenantA), programTenant: ""}
	rec := runMediaGet(t, content, mediaTenantB, true)

	requireMediaFail(t, rec, http.StatusForbidden, "forbidden")
	if content.programCalls != 0 {
		t.Fatalf("GetContentProgramTenant called %d time(s); row tenant must short-circuit the fallback", content.programCalls)
	}
}

// (e) Valid tenant but the file is missing on disk -> 404 not_found (not 403/500).
func TestMediaContent_MissingFileOnDiskNotFound(t *testing.T) {
	content := &mediaContentRepo{content: newMediaContent(mediaTenantA), programTenant: ""}
	rec := runMediaGet(t, content, mediaTenantA, false)

	requireMediaFail(t, rec, http.StatusNotFound, "not_found")
}
