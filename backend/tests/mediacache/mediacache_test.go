package mediacache_test

// Conditional-GET caching contract for the three raw-media byte endpoints:
// MediaHandler.Get, GalleryHandler.GetPhoto, and ReportHandler.GetAccessPhoto.
// All three share serveMediaBlob (media_handler.go), so one test file pins the
// whole contract:
//
//	(i)   no If-None-Match          → 200 + body + ETag + Cache-Control: no-cache
//	(ii)  matching If-None-Match    → 304 + EMPTY body + ETag + Cache-Control (weak
//	                                  W/ prefix, comma lists, and "*" tolerated)
//	iii)  stale/mismatched If-None-Match → 200 + body + ETag (revalidate fully)
//
// stdlib testing only; hand-rolled in-process fakes per repo convention — no
// testify/gomock, no database, no network.

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/pkg/sse"
	reports "kidversa-edutourism-backend/internal/usecase/reports"
)

const (
	cacheTenantID  = "tenant-cache"
	cacheContentID = "99999999-9999-4999-8999-999999999999"
	cachePhotoID   = "11111111-1111-4111-8111-111111111111"
	cacheReportID  = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	cachePartID    = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	cacheSessID    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	cacheStageID   = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	// cacheSessionStageID is the session_stages row instantiating cacheStageID
	// (the report's topic) inside cacheSessID — photos carry it as their
	// session_stage_id (migration 000009), and topic-true resolution matches on
	// it.
	cacheSessionStageID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
	cacheToken64        = "abababababababababababababababababababababababababababababababab"
	// cacheRelPath mirrors the upload layout; one real file serves all three
	// handlers (each resolves its own stored path to the same bytes).
	cacheRelPath = "contents/cached.png"
)

var cacheBytes = []byte("\x89PNG\r\n\x1a\nconditional-get-contract")

// ── Fakes (embed the full repo interface; only the methods on the tested path
// are implemented, everything else panics loudly on accidental use) ──────────

type fakeContentRepo struct {
	repository.ContentRepository
	content *entity.Content
}

func (f *fakeContentRepo) GetContentByID(_ context.Context, id string) (*entity.Content, error) {
	if f.content == nil || f.content.ID != id {
		return nil, apperrors.NotFound("not_found", nil)
	}
	clone := *f.content
	return &clone, nil
}

type emptyPhotoRepo struct{ repository.PhotoRepository }
type emptyConsentRepo struct{ repository.ConsentRepository }
type emptySessionRepo struct{ repository.SessionRepository }
type emptyFrameRepo struct{ repository.FrameRepository }
type emptyUserRepo struct{ repository.UserRepository }

// ListSessionStages feeds the report-photo resolution (and the gallery topics
// list): the session instantiates cacheStageID's topic as cacheSessionStageID.
// Every other method stays on the embedded nil interface — calling it panics
// loudly, which is this file's convention.
func (f *emptySessionRepo) ListSessionStages(context.Context, string) ([]entity.SessionStage, error) {
	st := entity.SessionStage{ProgramStageID: cacheStageID, SessionID: cacheSessID}
	st.ID = cacheSessionStageID
	return []entity.SessionStage{st}, nil
}

// fakeGalleryRepo serves the single gallery token under test.
type fakeGalleryRepo struct {
	repository.GalleryTokenRepository
	gt *entity.GalleryToken
}

func (f *fakeGalleryRepo) GetByToken(context.Context, string) (*entity.GalleryToken, error) {
	return f.gt, nil
}

// grantedConsentRepo always grants PHOTO consent (the gates are exercised by
// their own tests; this file targets the caching contract).
type grantedConsentRepo struct{ repository.ConsentRepository }

func (f *grantedConsentRepo) GetConsentValue(context.Context, string, string, entity.ConsentType) (bool, error) {
	return true, nil
}

// fakePhotoRepo serves one photo: GetPhotoByID for the gallery route, pick +
// ListPhotos for the report route's resolveReportPhotoWithFallback.
type fakePhotoRepo struct {
	repository.PhotoRepository
	photo *entity.SmartPhoto
}

func (f *fakePhotoRepo) GetPhotoByID(_ context.Context, id, _ string) (*entity.SmartPhoto, error) {
	if f.photo == nil || f.photo.ID != id {
		return nil, apperrors.NotFound("not_found", nil)
	}
	clone := *f.photo
	return &clone, nil
}

func (f *fakePhotoRepo) GetReportPhotoPick(context.Context, string, string, string) (*entity.ReportPhotoPick, error) {
	return nil, nil // no pick → tier-2 is_report_photo fallback
}

func (f *fakePhotoRepo) ListPhotos(_ context.Context, filt repository.PhotoFilter, _, _ int) (*repository.Paginated[entity.SmartPhoto], error) {
	if f.photo == nil ||
		f.photo.ParticipantID != filt.ParticipantID ||
		f.photo.SessionID != filt.SessionID {
		return &repository.Paginated[entity.SmartPhoto]{}, nil
	}
	if filt.IsReportPhoto != nil && f.photo.IsReportPhoto != *filt.IsReportPhoto {
		return &repository.Paginated[entity.SmartPhoto]{}, nil
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: []entity.SmartPhoto{*f.photo}, Total: 1}, nil
}

// fakeReportRepo serves the report behind the parent access token.
type fakeReportRepo struct {
	repository.ReportRepository
	report *entity.Report
}

func (f *fakeReportRepo) GetByToken(context.Context, string) (*entity.Report, error) {
	return f.report, nil
}

// ── Harness ────────────────────────────────────────────────────────────────

// env holds the three handlers over one temp upload dir seeded with cacheBytes.
type env struct {
	t     *testing.T
	media *handler.MediaHandler
	gal   *handler.GalleryHandler
	rep   *handler.ReportHandler
	e     *echo.Echo
}

func newEnv(t *testing.T) *env {
	t.Helper()
	dir := t.TempDir()
	dest := filepath.Join(dir, filepath.FromSlash(cacheRelPath))
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		t.Fatalf("create upload subdir: %v", err)
	}
	if err := os.WriteFile(dest, cacheBytes, 0o644); err != nil {
		t.Fatalf("seed media file: %v", err)
	}
	cfg := &config.Config{UploadDir: dir}

	content := &entity.Content{TenantID: cacheTenantID, FileURL: cacheRelPath}
	content.ID = cacheContentID

	photo := &entity.SmartPhoto{
		ParticipantID:   cachePartID,
		SessionID:       cacheSessID,
		SessionStageID:  cacheSessionStageID,
		OriginalFileURL: cacheRelPath,
		IsReportPhoto:   true,
	}
	photo.ID = cachePhotoID

	report := &entity.Report{
		ParticipantID:  cachePartID,
		SessionID:      cacheSessID,
		ProgramStageID: cacheStageID,
	}
	report.ID = cacheReportID

	gt := &entity.GalleryToken{
		ReportID:      cacheReportID,
		ParticipantID: cachePartID,
		SessionID:     cacheSessID,
		Token:         cacheToken64,
		ExpiresAt:     time.Now().Add(time.Hour),
	}

	reportRepo := &fakeReportRepo{report: report}
	photoRepo := &fakePhotoRepo{photo: photo}
	consent := &grantedConsentRepo{}

	uc := reports.NewUsecase(
		reportRepo,
		nil, // gen — not touched by GetAccessPhoto
		nil, // aiClient
		nil, nil, nil, nil, nil, nil, nil, nil,
		cfg,
		nil, nil, nil,
	)

	return &env{
		t: t,
		media: handler.NewMediaHandler(cfg,
			&emptyPhotoRepo{}, &emptyConsentRepo{}, &emptySessionRepo{},
			&emptyFrameRepo{}, &fakeContentRepo{content: content}, &emptyUserRepo{}),
		gal: handler.NewGalleryHandler(cfg, &fakeGalleryRepo{gt: gt}, reportRepo,
			photoRepo, &emptySessionRepo{}, consent),
		rep: handler.NewReportHandler(uc, cfg, &emptySessionRepo{}, sse.NewHub(),
			consent, photoRepo, nil),
		e: echo.New(),
	}
}

// run issues one conditional GET against the given endpoint: inm is the raw
// If-None-Match header value ("" = header absent).
func (e *env) run(endpoint, inm string) *httptest.ResponseRecorder {
	e.t.Helper()
	var url string
	switch endpoint {
	case "media":
		url = "/api/media/content/" + cacheContentID
	case "gallery":
		url = "/api/reports/gallery/photo/" + cachePhotoID + "?token=" + cacheToken64
	case "report":
		url = "/api/reports/access/photo?token=" + cacheToken64
	default:
		e.t.Fatalf("unknown endpoint %q", endpoint)
	}
	req := httptest.NewRequest(http.MethodGet, url, nil)
	if inm != "" {
		req.Header.Set("If-None-Match", inm)
	}
	rec := httptest.NewRecorder()
	c := e.e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{
		{Name: "kind", Value: "content"},
		{Name: "id", Value: cacheContentID},
		{Name: "photoId", Value: cachePhotoID},
	})
	// kind=content is tenant-scoped: caller tenant must equal the row tenant.
	c.Set(appmiddleware.CtxTenantID, cacheTenantID)

	var err error
	switch endpoint {
	case "media":
		err = e.media.Get(c)
	case "gallery":
		err = e.gal.GetPhoto(c)
	case "report":
		err = e.rep.GetAccessPhoto(c)
	}
	if err != nil {
		e.t.Fatalf("%s handler returned error: %v", endpoint, err)
	}
	return rec
}

// requireFull200 asserts the unconditional/stale-revalidation shape: 200 with
// the file bytes, a non-empty quoted ETag, and Cache-Control: no-cache.
// Returns the ETag for reuse (e.g. as the matching condition later).
func requireFull200(t *testing.T, rec *httptest.ResponseRecorder, who string) string {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("%s: status = %d, want 200 (body: %q)", who, rec.Code, rec.Body.String())
	}
	if !bytes.Equal(rec.Body.Bytes(), cacheBytes) {
		t.Fatalf("%s: body = %q, want file bytes %q", who, rec.Body.Bytes(), cacheBytes)
	}
	etag := rec.Header().Get("ETag")
	if etag == "" {
		t.Fatalf("%s:200 response missing ETag header", who)
	}
	if !strings.HasPrefix(etag, "\"") || !strings.HasSuffix(etag, "\"") {
		t.Fatalf("%s: ETag %q must be a quoted opaque string", who, etag)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Fatalf("%s: Cache-Control = %q, want no-cache", who, cc)
	}
	return etag
}

// requireNotModified asserts the 304 shape: 304, EMPTY body, ETag present and
// equal to wantETag, Cache-Control: no-cache, and no content-type payload.
func requireNotModified(t *testing.T, rec *httptest.ResponseRecorder, who, wantETag string) {
	t.Helper()
	if rec.Code != http.StatusNotModified {
		t.Fatalf("%s: status = %d, want 304 (body: %q)", who, rec.Code, rec.Body.String())
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("%s: 304 must carry an empty body, got %q", who, rec.Body.String())
	}
	if got := rec.Header().Get("ETag"); got != wantETag {
		t.Fatalf("%s: 304 ETag = %q, want %q", who, got, wantETag)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Fatalf("%s: 304 Cache-Control = %q, want no-cache", who, cc)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "" {
		t.Fatalf("%s: 304 must carry only the caching headers, found Content-Type %q", who, ct)
	}
}

var endpoints = []string{"media", "gallery", "report"}

// TestConditionalGet_FreshRequestServesFullBody: without If-None-Match every
// endpoint answers 200 + bytes + ETag + no-cache, and repeated requests over
// the same unchanged file yield the SAME ETag (the validator is stable, which
// is what lets a later conditional request match).
func TestConditionalGet_FreshRequestServesFullBody(t *testing.T) {
	e := newEnv(t)
	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			first := requireFull200(t, e.run(ep, ""), ep)
			second := requireFull200(t, e.run(ep, ""), ep)
			if first != second {
				t.Fatalf("%s: ETag drifted across identical requests: %q vs %q", ep, first, second)
			}
		})
	}
}

// TestConditionalGet_MatchingIfNoneMatch: an If-None-Match that matches the
// current ETag answers 304 with no body and only the caching headers — the
// matching tolerance is the full contract: exact value, weak W/ prefix,
// comma-separated lists containing the ETag, and "*".
func TestConditionalGet_MatchingIfNoneMatch(t *testing.T) {
	e := newEnv(t)
	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			etag := requireFull200(t, e.run(ep, ""), ep)
			cases := []struct {
				name string
				inm  string
			}{
				{"exact", etag},
				{"weak prefix", "W/" + etag},
				{"comma list with stale entry", `"stale-etag-value", ` + etag},
				{"any current representation", "*"},
			}
			for _, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					requireNotModified(t, e.run(ep, tc.inm), ep+" ("+tc.name+")", etag)
				})
			}
		})
	}
}

// TestConditionalGet_StaleIfNoneMatch: a condition that does not match the
// current ETag never produces304 — the full representation is served with the
// fresh validator so the client can cache it under the new key.
func TestConditionalGet_StaleIfNoneMatch(t *testing.T) {
	e := newEnv(t)
	stale := []string{
		`"deadbeef-deadbeef"`,
		`"00000000-00000000", "11111111-11111111"`,
		`W/"deadbeef-deadbeef"`,
	}
	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			current := requireFull200(t, e.run(ep, ""), ep)
			for _, inm := range stale {
				etag := requireFull200(t, e.run(ep, inm), ep+" stale "+inm)
				if etag != current {
					t.Fatalf("%s: stale revalidation changed the ETag: got %q, want %q", ep, etag, current)
				}
			}
		})
	}
}
