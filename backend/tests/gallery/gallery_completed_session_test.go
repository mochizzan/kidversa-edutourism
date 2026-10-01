package gallery_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
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

// ── Fakes untuk GET /api/reports/gallery?token= (jalur publik, tanpa JWT) ───
// Semua fake mem-bangun interface penuh via embedding: metode yang tidak
// dipakai jalur galeri akan panic (nil embedded) sehingga setiap panggilan
// repo yang tak terduga langsung gagal tes, bukan lolos senyap.

const (
	gParticipantID = "participant-1"
	gSessionID     = "session-1"
	gReportID      = "report-1"
)

// galleryToken64 adalah token 64-hex yang lolos galleryTokenFormat.
var galleryToken64 = strings.Repeat("ab", 32)

// galleryTokenRepo mengembalikan token fixture; token lain (termasuk format
// sah tapi tak dikenal) → 404 token_invalid, meniru GormGalleryTokenRepository.
type galleryTokenRepo struct {
	repository.GalleryTokenRepository
	token *entity.GalleryToken
}

func (f *galleryTokenRepo) GetByToken(_ context.Context, tok string) (*entity.GalleryToken, error) {
	if f.token == nil || tok != f.token.Token {
		return nil, apperrors.NotFound("token_invalid", errors.New("gallery token tidak dikenal"))
	}
	return f.token, nil
}

// gallerySessionRepo menyimpan sesi berstatus COMPLETED (kondisi yang diuji).
// GetSessionByID MENCATAT setiap panggilan: bila jalur galeri pernah membaca
// status sesi lewat sini, penghitung > 0 dan tes utama gagal — itulah
// detektor "ada cek status sesi yang belum terdeteksi".
type gallerySessionRepo struct {
	repository.SessionRepository
	session         *entity.Session
	participant     *entity.Participant
	getSessionCalls int
	lastParticipant string
}

func (f *gallerySessionRepo) GetParticipantByID(_ context.Context, id, _ string) (*entity.Participant, error) {
	f.lastParticipant = id
	return f.participant, nil
}

func (f *gallerySessionRepo) GetSessionByID(_ context.Context, id, _ string) (*entity.Session, error) {
	f.getSessionCalls++
	return f.session, nil
}

// galleryReportRepo: report selalu ada (gerbang "report hilang" bukan objek
// tes ini; handler memanggil GetByIDPublic tanpa membaca statusnya).
type galleryReportRepo struct {
	repository.ReportRepository
	report *entity.Report
}

func (f *galleryReportRepo) GetByIDPublic(context.Context, string) (*entity.Report, error) {
	return f.report, nil
}

// galleryConsentRepo mencatat argumen gerbang consent untuk dipastikan
// dipanggil dengan tipe PHOTO milik peserta pada token.
type galleryConsentRepo struct {
	repository.ConsentRepository
	granted  bool
	lastPID  string
	lastSID  string
	lastType entity.ConsentType
}

func (f *galleryConsentRepo) GetConsentValue(_ context.Context, pid, sid string, ct entity.ConsentType) (bool, error) {
	f.lastPID, f.lastSID, f.lastType = pid, sid, ct
	return f.granted, nil
}

// galleryPhotoRepo membedakan dua kueri ListPhotos pada jalur: filter
// IsReportPhoto (resolveReportPhoto → kosong, tak ada foto rapor berflag)
// vs filter galeri (tanpa IsReportPhoto → foto milik peserta).
type galleryPhotoRepo struct {
	repository.PhotoRepository
	photos     []entity.SmartPhoto
	lastFilter repository.PhotoFilter
}

func (f *galleryPhotoRepo) GetReportPhotoPick(context.Context, string, string, string) (*entity.ReportPhotoPick, error) {
	return nil, nil
}

func (f *galleryPhotoRepo) ListPhotos(_ context.Context, flt repository.PhotoFilter, _, _ int) (*repository.Paginated[entity.SmartPhoto], error) {
	f.lastFilter = flt
	if flt.IsReportPhoto != nil {
		return &repository.Paginated[entity.SmartPhoto]{}, nil
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: f.photos, Total: len(f.photos)}, nil
}

// galleryFixture adalah jalur GET /api/reports/gallery lengkap di atas fake
// in-process (tanpa DB, tanpa jaringan). Sesi berstatus COMPLETED disimpan di
// fake — kondisi default seluruh tes di berkas ini.
type galleryFixture struct {
	h        *handler.GalleryHandler
	token    *entity.GalleryToken
	sessions *gallerySessionRepo
	consent  *galleryConsentRepo
	photos   *galleryPhotoRepo
}

func newGalleryFixture(t *testing.T, consentGranted bool) *galleryFixture {
	t.Helper()
	session := &entity.Session{ProgramID: "program-1", Status: entity.SessionCompleted}
	session.ID = gSessionID

	participant := &entity.Participant{ChildName: "Budi Santoso", ChildAge: 7}
	participant.ID = gParticipantID

	report := &entity.Report{
		BaseModel:      entity.BaseModel{ID: gReportID},
		ParticipantID:  gParticipantID,
		SessionID:      gSessionID,
		ProgramStageID: "stage-1",
		Status:         entity.ReportApproved,
		GroupName:      "Kelompok A",
	}

	token := &entity.GalleryToken{
		ReportID:      gReportID,
		ParticipantID: gParticipantID,
		SessionID:     gSessionID,
		TenantID:      "tenant-1",
		Token:         galleryToken64,
		ExpiresAt:     time.Now().Add(7 * 24 * time.Hour), // TTL galeri: 7 hari
		Revoked:       false,
	}

	photos := []entity.SmartPhoto{
		{
			BaseModel:       entity.BaseModel{ID: "photo-1"},
			ParticipantID:   gParticipantID,
			SessionID:       gSessionID,
			OriginalFileURL: "/api/media/photos/photo-1.jpg",
			TakenBy:         "fasilitator-1",
			TakenAt:         time.Date(2026, 9, 20, 10, 0, 0, 0, time.UTC),
		},
		{
			BaseModel:       entity.BaseModel{ID: "photo-2"},
			ParticipantID:   gParticipantID,
			SessionID:       gSessionID,
			OriginalFileURL: "/api/media/photos/photo-2.jpg",
			TakenBy:         "fasilitator-1",
			TakenAt:         time.Date(2026, 9, 20, 11, 0, 0, 0, time.UTC),
		},
	}

	sessions := &gallerySessionRepo{session: session, participant: participant}
	consent := &galleryConsentRepo{granted: consentGranted}
	photoRepo := &galleryPhotoRepo{photos: photos}

	h := handler.NewGalleryHandler(
		&config.Config{UploadDir: t.TempDir()},
		&galleryTokenRepo{token: token},
		&galleryReportRepo{report: report},
		photoRepo,
		sessions,
		consent,
	)
	return &galleryFixture{h: h, token: token, sessions: sessions, consent: consent, photos: photoRepo}
}

// callGallery menjalankan handler persis seperti rute (validator echo yang
// sama dengan yang dipasang router) dan mengembalikan recorder + error.
func callGallery(t *testing.T, h *handler.GalleryHandler, target string) (*httptest.ResponseRecorder, error) {
	t.Helper()
	e := echo.New()
	e.Validator = appmiddleware.NewValidator() // sama dengan router
	req := httptest.NewRequest(http.MethodGet, target, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	return rec, h.GetByToken(c)
}

// requireGalleryAppError memastikan err adalah AppError dengan kode & status
// persis (jalur yang mengembalikan error, bukan menulis respons sendiri).
func requireGalleryAppError(t *testing.T, err error, wantStatus int, wantCode string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error %q (status %d), got nil", wantCode, wantStatus)
	}
	status, code, ok := apperrors.AsAppError(err)
	if !ok || status != wantStatus || code != wantCode {
		t.Fatalf("error = status %d code %q (ok=%v), want status %d code %q (err: %v)",
			status, code, ok, wantStatus, wantCode, err)
	}
}

// requireFailCode memastikan respons tertulis memuat kode error pada envelope
// standar (jalur yang menjawab langsung via appresp.Fail).
func requireFailCode(t *testing.T, rec *httptest.ResponseRecorder, wantStatus int, wantCode string) {
	t.Helper()
	if rec.Code != wantStatus {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, wantStatus, rec.Body.String())
	}
	var env struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode envelope: %v (body: %s)", err, rec.Body.String())
	}
	if env.Error.Code != wantCode {
		t.Fatalf("error.code = %q, want %q (body: %s)", env.Error.Code, wantCode, rec.Body.String())
	}
}

// TestGalleryOpenWhenSessionCompleted adalah tes inti: sesi berstatus
// COMPLETED + token valid + consent granted → galeri terbuka (200) dengan
// data foto. Jika jalur ini punya cek status sesi, tes gagal — entah lewat
// non-200, entah lewat penghitung GetSessionByID (bukti pembacaan status).
func TestGalleryOpenWhenSessionCompleted(t *testing.T) {
	fx := newGalleryFixture(t, true)

	if fx.sessions.session.Status != entity.SessionCompleted {
		t.Fatalf("fixture sesi = %q, want COMPLETED (kondisi yang diuji)", fx.sessions.session.Status)
	}

	rec, err := callGallery(t, fx.h, "/api/reports/gallery?token="+galleryToken64)
	if err != nil {
		t.Fatalf("GetByToken error: %v (galeri harus terbuka saat sesi COMPLETED)", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
	}

	var env struct {
		Data struct {
			ReportID      string `json:"report_id"`
			ParticipantID string `json:"participant_id"`
			SessionID     string `json:"session_id"`
			ChildName     string `json:"child_name"`
			Photos        []struct {
				ID              string `json:"id"`
				OriginalFileURL string `json:"original_file_url"`
			} `json:"photos"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode payload: %v (body: %s)", err, rec.Body.String())
	}
	if env.Data.ReportID != gReportID || env.Data.ParticipantID != gParticipantID || env.Data.SessionID != gSessionID {
		t.Errorf("payload identitas = report %q / participant %q / session %q",
			env.Data.ReportID, env.Data.ParticipantID, env.Data.SessionID)
	}
	if env.Data.ChildName != "Budi Santoso" {
		t.Errorf("child_name = %q", env.Data.ChildName)
	}
	if len(env.Data.Photos) != 2 {
		t.Fatalf("len(photos) = %d, want 2 (data foto ikut terkirim)", len(env.Data.Photos))
	}
	for _, p := range env.Data.Photos {
		if p.ID == "" || p.OriginalFileURL == "" {
			t.Errorf("foto %q tanpa url: %+v", p.ID, p)
		}
	}

	// Bukti nol cek status sesi: jalur galeri tidak pernah membaca sesi.
	if fx.sessions.getSessionCalls != 0 {
		t.Errorf("GetSessionByID dipanggil %d× — jalur galeri membaca status sesi (cek tak terdeteksi)",
			fx.sessions.getSessionCalls)
	}
	// Jalur benar-benar terjalankan (bukan lolos karena berhenti lebih awal).
	if fx.sessions.lastParticipant != gParticipantID {
		t.Errorf("GetParticipantByID dipanggil dengan %q, want %q (token participant)",
			fx.sessions.lastParticipant, gParticipantID)
	}
	// Gerbang consent tetap dijalankan dengan tipe PHOTO milik token.
	if fx.consent.lastType != entity.ConsentPhoto ||
		fx.consent.lastPID != gParticipantID || fx.consent.lastSID != gSessionID {
		t.Errorf("gerbang consent dipanggil dengan (%q, %q, %q), want (%q, %q, %q)",
			fx.consent.lastPID, fx.consent.lastSID, fx.consent.lastType,
			gParticipantID, gSessionID, entity.ConsentPhoto)
	}
	// Foto yang tampil difilter ke peserta pada token.
	if fx.photos.lastFilter.ParticipantID != gParticipantID || fx.photos.lastFilter.SessionID != gSessionID {
		t.Errorf("filter foto = %+v, want participant/session token", fx.photos.lastFilter)
	}
}

// TestGalleryGatesStillDenyWithoutValidToken membuktikan akses TANPA token
// valid tetap tertolak meski sesi COMPLETED — yang terbuka hanya jalur
// ber-token: format salah → 400, token tak dikenal → 404, consent belum
// granted → 403, revoked → 410, kedaluwarsa → 410.
func TestGalleryGatesStillDenyWithoutValidToken(t *testing.T) {
	t.Run("tanpa_token", func(t *testing.T) {
		fx := newGalleryFixture(t, true)
		rec, err := callGallery(t, fx.h, "/api/reports/gallery")
		if err != nil {
			t.Fatalf("handler error: %v", err)
		}
		requireFailCode(t, rec, http.StatusBadRequest, "bad_request")
	})

	t.Run("format_token_salah", func(t *testing.T) {
		fx := newGalleryFixture(t, true)
		rec, err := callGallery(t, fx.h, "/api/reports/gallery?token=xyz")
		if err != nil {
			t.Fatalf("handler error: %v", err)
		}
		requireFailCode(t, rec, http.StatusBadRequest, "bad_request")
	})

	t.Run("token_tidak_dikenal", func(t *testing.T) {
		fx := newGalleryFixture(t, true)
		unknown := strings.Repeat("cd", 32) // 64-hex sah, tak ada di repo
		rec, err := callGallery(t, fx.h, "/api/reports/gallery?token="+unknown)
		requireGalleryAppError(t, err, http.StatusNotFound, "token_invalid")
		if rec.Body.Len() != 0 {
			t.Fatalf("handler tidak boleh menulis body saat mengembalikan error, got: %s", rec.Body.String())
		}
	})

	t.Run("consent_belum_granted", func(t *testing.T) {
		fx := newGalleryFixture(t, false) // sesi COMPLETED, tapi consent OFF
		rec, err := callGallery(t, fx.h, "/api/reports/gallery?token="+galleryToken64)
		if err != nil {
			t.Fatalf("handler error: %v", err)
		}
		requireFailCode(t, rec, http.StatusForbidden, "consent_required")
	})

	t.Run("token_revoked", func(t *testing.T) {
		fx := newGalleryFixture(t, true)
		fx.token.Revoked = true
		rec, err := callGallery(t, fx.h, "/api/reports/gallery?token="+galleryToken64)
		if err != nil {
			t.Fatalf("handler error: %v", err)
		}
		requireFailCode(t, rec, http.StatusGone, "token_revoked")
	})

	t.Run("token_expired", func(t *testing.T) {
		fx := newGalleryFixture(t, true)
		fx.token.ExpiresAt = time.Now().Add(-time.Hour)
		rec, err := callGallery(t, fx.h, "/api/reports/gallery?token="+galleryToken64)
		if err != nil {
			t.Fatalf("handler error: %v", err)
		}
		requireFailCode(t, rec, http.StatusGone, "token_expired")
	})
}

// TestGalleryRateLimitStillApplies memastikan RateLimit yang membungkus rute
// tetap berlaku: dalam kuota lolos ke handler (200), permintaan berikutnya
// dari IP sama ditolak 429 dengan Retry-After sebelum handler dijalankan.
func TestGalleryRateLimitStillApplies(t *testing.T) {
	fx := newGalleryFixture(t, true)
	const perMin = 3

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	limited := appmiddleware.RateLimit(perMin)(func(c *echo.Context) error {
		return fx.h.GetByToken(c)
	})
	target := "/api/reports/gallery?token=" + galleryToken64

	for i := 1; i <= perMin; i++ {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		if err := limited(c); err != nil {
			t.Fatalf("permintaan %d (dalam kuota): %v", i, err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("permintaan %d: status = %d, want 200", i, rec.Code)
		}
	}

	req := httptest.NewRequest(http.MethodGet, target, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	err := limited(c)
	var he *echo.HTTPError
	if !errors.As(err, &he) || he.Code != http.StatusTooManyRequests {
		t.Fatalf("permintaan melebihi kuota: err = %v, want HTTPError 429", err)
	}
	if got := rec.Header().Get("Retry-After"); got == "" {
		t.Error("respons 429 wajib membawa header Retry-After")
	}
	if rec.Body.Len() != 0 {
		t.Errorf("handler tidak boleh dijalankan saat 429, body: %s", rec.Body.String())
	}
}
