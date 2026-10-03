package galleryphoto_test

import (
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
)

// ── Fakes (in-process, tanpa DB — konvensi repo: embed interface penuh) ─────

// fakeGalleryRepo mengembalikan satu baris gallery_token yang sudah di-set
// fixture, atau err (mis. token_unknown → 404 token_invalid).
type fakeGalleryRepo struct {
	repository.GalleryTokenRepository
	gt  *entity.GalleryToken
	err error
}

func (f *fakeGalleryRepo) GetByToken(context.Context, string) (*entity.GalleryToken, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.gt, nil
}

// fakeConsentRepo menentukan hasil gerbang consent (true = granted).
type fakeConsentRepo struct {
	repository.ConsentRepository
	granted bool
}

func (f *fakeConsentRepo) GetConsentValue(context.Context, string, string, entity.ConsentType) (bool, error) {
	return f.granted, nil
}

// fakePhotoRepo in-memory: GetPhotoByID (mirror GORM: tak ada → 404
// not_found) dan ListPhotos dengan filter partisipan/sesi/is_report_photo
// (dipakai resolveReportPhoto di jalur GetByToken).
type fakePhotoRepo struct {
	repository.PhotoRepository
	photos map[string]*entity.SmartPhoto
}

func newFakePhotoRepo() *fakePhotoRepo {
	return &fakePhotoRepo{photos: map[string]*entity.SmartPhoto{}}
}

func (f *fakePhotoRepo) GetPhotoByID(_ context.Context, id, _ string) (*entity.SmartPhoto, error) {
	p, ok := f.photos[id]
	if !ok {
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
		// Mirror GormPhotoRepository: non-nil SessionStageID = strict equality
		// (nil = no stage filter).
		if filt.SessionStageID != nil && p.SessionStageID != *filt.SessionStageID {
			continue
		}
		out = append(out, *p)
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: out, Total: len(out)}, nil
}

func (f *fakePhotoRepo) GetReportPhotoPick(context.Context, string, string, string) (*entity.ReportPhotoPick, error) {
	return nil, nil // tanpa pick → fallback is_report_photo di resolveReportPhoto
}

// fakeSessionRepo menyediakan peserta dan topik (session_stages) untuk DTO
// GetByToken serta resolusi foto rapor bertopik (migrasi 000009).
type fakeSessionRepo struct {
	repository.SessionRepository
	participant *entity.Participant
	stages      []entity.SessionStage
}

func (f *fakeSessionRepo) GetParticipantByID(context.Context, string, string) (*entity.Participant, error) {
	return f.participant, nil
}

func (f *fakeSessionRepo) ListSessionStages(context.Context, string) ([]entity.SessionStage, error) {
	return f.stages, nil
}

// fakeReportRepo menyediakan report untuk DTO GetByToken.
type fakeReportRepo struct {
	repository.ReportRepository
	report *entity.Report
}

func (f *fakeReportRepo) GetByIDPublic(context.Context, string) (*entity.Report, error) {
	return f.report, nil
}

// ── Fixture ─────────────────────────────────────────────────────────────────

const (
	validToken  = "abababababababababababababababababababababababababababababababab"
	photoID     = "11111111-1111-4111-8111-111111111111"
	photoID2    = "22222222-2222-4222-8222-222222222222"
	partID      = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	sessID      = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	reportID    = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	otherPartID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
	otherSessID = "ffffffff-ffff-4fff-8fff-ffffffffffff"
)

// fixture membangun GalleryHandler + route penuh di atas echo in-process
// (httptest, tanpa DB/network) dengan UploadDir = t.TempDir().
type fixture struct {
	t       *testing.T
	dir     string
	gallery *fakeGalleryRepo
	consent *fakeConsentRepo
	photos  *fakePhotoRepo
	e       *echo.Echo
	// validGT adalah salinan token valid bawaan — dipakai subtest untuk
	// me-reset state gallery repo ke kondisi default.
	validGT entity.GalleryToken
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	dir := t.TempDir()
	cfg := &config.Config{UploadDir: dir, RateLimitPerMin: 60}

	f := &fixture{
		t:       t,
		dir:     dir,
		gallery: &fakeGalleryRepo{},
		consent: &fakeConsentRepo{granted: true},
		photos:  newFakePhotoRepo(),
	}
	f.gallery.gt = &entity.GalleryToken{
		ReportID:      reportID,
		ParticipantID: partID,
		SessionID:     sessID,
		Token:         validToken,
		ExpiresAt:     time.Now().Add(time.Hour),
	}
	f.validGT = *f.gallery.gt

	participant := &entity.Participant{ChildName: "Budi"}
	participant.ID = partID
	report := &entity.Report{
		ParticipantID:  partID,
		SessionID:      sessID,
		ProgramStageID: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		GroupName:      "Kelompok A",
	}
	report.ID = reportID

	// Sesi menginstansiasi topik report tersebut sebagai stage-session-1.
	stage := entity.SessionStage{ProgramStageID: report.ProgramStageID, SessionID: sessID, ProgramStageName: "Topik 1"}
	stage.ID = "stage-session-1"

	h := handler.NewGalleryHandler(cfg, f.gallery, &fakeReportRepo{report: report},
		f.photos, &fakeSessionRepo{participant: participant, stages: []entity.SessionStage{stage}}, f.consent)

	e := echo.New()
	e.HTTPErrorHandler = appmiddleware.ErrorHandler // sama seperti router produksi
	handler.RegisterGalleryRoutes(e.Group("/api/reports"), h, cfg)
	f.e = e
	return f
}

// putFile menulis file di bawah UploadDir (rel = path relatif dengan /).
func (f *fixture) putFile(rel, content string) {
	f.t.Helper()
	dest := filepath.Join(f.dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(dest), 0o750); err != nil {
		f.t.Fatalf("MkdirAll: %v", err)
	}
	if err := os.WriteFile(dest, []byte(content), 0o600); err != nil {
		f.t.Fatalf("WriteFile: %v", err)
	}
}

// addPhoto menanam satu baris foto milik participant+session tertentu.
func (f *fixture) addPhoto(id, participant, session, original, framed string) {
	p := &entity.SmartPhoto{
		ParticipantID:   participant,
		SessionID:       session,
		OriginalFileURL: original,
		FramedFileURL:   framed,
	}
	p.ID = id
	f.photos.photos[id] = p
}

// get memanggil rute penuh lewat router (membuktikan route terdaftar).
func (f *fixture) get(url string) *httptest.ResponseRecorder {
	f.t.Helper()
	req := httptest.NewRequest(http.MethodGet, url, nil)
	rec := httptest.NewRecorder()
	f.e.ServeHTTP(rec, req)
	return rec
}

func (f *fixture) photoURL(photoID, query string) string {
	return "/api/reports/gallery/photo/" + photoID + query
}

// requireStatusAndCode mengunci status + kode error pada envelope JSON.
func requireStatusAndCode(t *testing.T, rec *httptest.ResponseRecorder, wantStatus int, wantCode string) {
	t.Helper()
	if rec.Code != wantStatus {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, wantStatus, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"code":"`+wantCode+`"`) {
		t.Fatalf("body tidak memuat kode %q: %s", wantCode, rec.Body.String())
	}
}

// ── Tests ───────────────────────────────────────────────────────────────────

// TestGalleryPhotoEndpoint_ServesBytesWithVariant: jalur sukses penuh — route
// TERDAFTAR (200 lewat router, bukan 404 Not Found), byte sesuai file, dan
// pemilihan path per kontrak: variant=framed → framed (fallback original
// bila framed kosong), tanpa variant / variant=original → original.
func TestGalleryPhotoEndpoint_ServesBytesWithVariant(t *testing.T) {
	f := newFixture(t)
	f.putFile("photos/orig.png", "BYTES-ORIG")
	f.putFile("photos/framed.png", "BYTES-FRAMED")
	f.putFile("photos/orig2.png", "BYTES-ORIG2")
	f.addPhoto(photoID, partID, sessID, "photos/orig.png", "photos/framed.png")
	// Foto TANPA framed: variant=framed harus jatuh ke original.
	f.addPhoto(photoID2, partID, sessID, "photos/orig2.png", "")

	q := "?token=" + validToken

	rec := f.get(f.photoURL(photoID, q+"&variant=framed"))
	if rec.Code != http.StatusOK {
		t.Fatalf("variant=framed status = %d, want 200 (route terdaftar & byte tersaji): %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Fatalf("Content-Type = %q, want image/png", ct)
	}
	if got := rec.Body.String(); got != "BYTES-FRAMED" {
		t.Fatalf("variant=framed body = %q, want BYTES-FRAMED", got)
	}

	rec = f.get(f.photoURL(photoID2, q+"&variant=framed"))
	if rec.Code != http.StatusOK || rec.Body.String() != "BYTES-ORIG2" {
		t.Fatalf("framed kosong harus fallback ke original: status=%d body=%q", rec.Code, rec.Body.String())
	}

	rec = f.get(f.photoURL(photoID, q))
	if rec.Code != http.StatusOK || rec.Body.String() != "BYTES-ORIG" {
		t.Fatalf("tanpa variant harus original: status=%d body=%q", rec.Code, rec.Body.String())
	}

	rec = f.get(f.photoURL(photoID, q+"&variant=original"))
	if rec.Code != http.StatusOK || rec.Body.String() != "BYTES-ORIG" {
		t.Fatalf("variant=original harus original: status=%d body=%q", rec.Code, rec.Body.String())
	}
}

// TestGalleryPhotoEndpoint_TokenGates: validasi token di-share dengan
// GetByToken — format salah → 400, tak dikenal → 404 token_invalid, dicabut →
// 410 token_revoked. Tak satu pun dari galat ini boleh menyajikan byte.
// Kedaluwarsa BUKAN penolak: masa berlaku QR galeri tidak pernah habis —
// token lampau tetap menyajikan byte (subtest tersendiri di bawah).
func TestGalleryPhotoEndpoint_TokenGates(t *testing.T) {
	f := newFixture(t)
	f.putFile("photos/orig.png", "BYTES-ORIG")
	f.addPhoto(photoID, partID, sessID, "photos/orig.png", "")

	cases := []struct {
		name       string
		token      string
		setup      func()
		wantStatus int
		wantCode   string
	}{
		{"token kosong", "", nil, http.StatusBadRequest, "bad_request"},
		{"token bukan 64hex", "abc123", nil, http.StatusBadRequest, "bad_request"},
		{"token tak dikenal", validToken, func() {
			f.gallery.err = apperrors.NotFound("token_invalid", nil)
		}, http.StatusNotFound, "token_invalid"},
		{"token dicabut", validToken, func() {
			f.gallery.gt.Revoked = true
		}, http.StatusGone, "token_revoked"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Reset ke state valid, lalu terapkan skenario.
			gt := f.validGT
			f.gallery.gt = &gt
			f.gallery.err = nil
			if tc.setup != nil {
				tc.setup()
			}
			q := "?token=" + tc.token
			rec := f.get(f.photoURL(photoID, q))
			requireStatusAndCode(t, rec, tc.wantStatus, tc.wantCode)
			if strings.Contains(rec.Body.String(), "BYTES") {
				t.Fatalf("byte tersaji meski token ditolak: %s", rec.Body.String())
			}
		})
	}

	t.Run("token kedaluwarsa tetap menyajikan byte", func(t *testing.T) {
		// QR yang sudah tercetak tidak boleh pernah expired: expires_at lampau
		// tidak menolak dan tidak menyembunyikan byte.
		gt := f.validGT
		f.gallery.gt = &gt
		f.gallery.err = nil
		f.gallery.gt.ExpiresAt = time.Now().Add(-time.Minute)
		rec := f.get(f.photoURL(photoID, "?token="+validToken))
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (token kedaluwarsa tidak boleh ditolak): %s", rec.Code, rec.Body.String())
		}
		if got := rec.Body.String(); got != "BYTES-ORIG" {
			t.Fatalf("body = %q, want BYTES-ORIG", got)
		}
	})
}

// TestGalleryPhotoEndpoint_ConsentGate: gerbang consent IDENTIK dengan
// GetByToken — tanpa persetujuan orang tua → 403 consent_required SEBELUM
// byte disajikan.
func TestGalleryPhotoEndpoint_ConsentGate(t *testing.T) {
	f := newFixture(t)
	f.putFile("photos/orig.png", "BYTES-ORIG")
	f.addPhoto(photoID, partID, sessID, "photos/orig.png", "")
	f.consent.granted = false

	rec := f.get(f.photoURL(photoID, "?token="+validToken))
	requireStatusAndCode(t, rec, http.StatusForbidden, "consent_required")
	if strings.Contains(rec.Body.String(), "BYTES") {
		t.Fatalf("byte tersaji meski consent OFF: %s", rec.Body.String())
	}
}

// TestGalleryPhotoEndpoint_AntiIDOR: foto WAJIB milik participant+session
// token. Foto milik peserta lain / sesi lain / ID tak dikenal → 404 — token
// satu anak tidak pernah bisa membaca galeri anak lain.
func TestGalleryPhotoEndpoint_AntiIDOR(t *testing.T) {
	f := newFixture(t)
	f.putFile("photos/orig.png", "BYTES-ORIG")

	t.Run("foto milik peserta lain", func(t *testing.T) {
		f.addPhoto(photoID, otherPartID, sessID, "photos/orig.png", "")
		rec := f.get(f.photoURL(photoID, "?token="+validToken))
		requireStatusAndCode(t, rec, http.StatusNotFound, "not_found")
	})
	t.Run("foto milik sesi lain", func(t *testing.T) {
		f.addPhoto(photoID, partID, otherSessID, "photos/orig.png", "")
		rec := f.get(f.photoURL(photoID, "?token="+validToken))
		requireStatusAndCode(t, rec, http.StatusNotFound, "not_found")
	})
	t.Run("id foto tak dikenal", func(t *testing.T) {
		rec := f.get(f.photoURL("99999999-9999-4999-8999-999999999999", "?token="+validToken))
		requireStatusAndCode(t, rec, http.StatusNotFound, "not_found")
	})
}

// TestGalleryPhotoEndpoint_FileGates: pengamanan disk mengikuti pola
// GetAccessPhoto — file hilang → 404, HTML di disk → diblokir (stored-XSS),
// path traversal keluar UploadDir → 404. Tidak ada byte yang bocor.
func TestGalleryPhotoEndpoint_FileGates(t *testing.T) {
	f := newFixture(t)
	q := "?token=" + validToken

	t.Run("file tak ada di disk", func(t *testing.T) {
		f.addPhoto(photoID, partID, sessID, "photos/hilang.png", "")
		rec := f.get(f.photoURL(photoID, q))
		requireStatusAndCode(t, rec, http.StatusNotFound, "not_found")
	})
	t.Run("html diblokir", func(t *testing.T) {
		f.putFile("photos/evil.html", "<html>xss</html>")
		f.addPhoto(photoID, partID, sessID, "photos/evil.html", "")
		rec := f.get(f.photoURL(photoID, q))
		requireStatusAndCode(t, rec, http.StatusForbidden, "file_type_blocked")
	})
	t.Run("path traversal keluar UploadDir", func(t *testing.T) {
		f.addPhoto(photoID, partID, sessID, "../escape.png", "")
		rec := f.get(f.photoURL(photoID, q))
		requireStatusAndCode(t, rec, http.StatusNotFound, "not_found")
	})
}

// TestGetByToken_EnvelopeUnchangedByShareHelper: regresi refactor
// share-helper — GetByToken tetap menjawab 200 dengan DTO berisi id foto +
// field file yang ARTINYA TIDAK BERUBAH (path relatif apa adanya), 403
// consent_required saat consent OFF, dan token kedaluwarsa TETAP 200 (QR
// galeri tak pernah kedaluwarsa).
func TestGetByToken_EnvelopeUnchangedByShareHelper(t *testing.T) {
	t.Run("daftar foto utuh", func(t *testing.T) {
		f := newFixture(t)
		f.putFile("photos/orig.png", "BYTES-ORIG")
		f.addPhoto(photoID, partID, sessID, "photos/orig.png", "photos/framed.png")

		rec := f.get("/api/reports/gallery?token=" + validToken)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
		}
		body := rec.Body.String()
		for _, want := range []string{
			`"id":"` + photoID + `"`,
			`"original_file_url":"photos/orig.png"`,
			`"framed_file_url":"photos/framed.png"`,
			`"child_name":"Budi"`,
		} {
			if !strings.Contains(body, want) {
				t.Fatalf("DTO tidak memuat %s — arti field lama harus tak berubah: %s", want, body)
			}
		}
		if strings.Contains(body, validToken) {
			t.Fatalf("token mentah tak boleh masuk DTO: %s", body)
		}
	})
	t.Run("consent OFF tetap 403", func(t *testing.T) {
		f := newFixture(t)
		f.consent.granted = false
		rec := f.get("/api/reports/gallery?token=" + validToken)
		requireStatusAndCode(t, rec, http.StatusForbidden, "consent_required")
	})
	t.Run("token kedaluwarsa tetap 200", func(t *testing.T) {
		f := newFixture(t)
		f.putFile("photos/orig.png", "BYTES-ORIG")
		f.addPhoto(photoID, partID, sessID, "photos/orig.png", "")
		f.gallery.gt.ExpiresAt = time.Now().Add(-time.Minute)
		rec := f.get("/api/reports/gallery?token=" + validToken)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (token kedaluwarsa tidak boleh ditolak): %s", rec.Code, rec.Body.String())
		}
	})
}
