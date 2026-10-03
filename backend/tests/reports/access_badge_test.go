package reports_test

// ── GET /api/reports/access/badge/:contentId (rute publik token-scoped) ──────
// Fixtures pakai pola fake interface-embedding yang sama dengan
// public_view_test.go / reportphoto: hanya metode yang dilewati jalur rute
// yang diimplementasi; metode lain panik bila tersentuh (bawaan embedding).

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

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

// badgeReportRepo mengembalikan satu report (atau error) untuk token apa pun.
type badgeReportRepo struct {
	repository.ReportRepository
	report *entity.Report
	err    error
}

func (f *badgeReportRepo) GetByToken(context.Context, string) (*entity.Report, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.report, nil
}

// badgeSubstageRepo adalah sumber keanggotaan badge (anti-IDOR) via aksesor
// usecase ListBadges → ListBadgesByParticipant.
type badgeSubstageRepo struct {
	repository.SessionSubstageRepository
	badges []entity.ParticipantBadge
}

func (f *badgeSubstageRepo) ListBadgesByParticipant(context.Context, string, string) ([]entity.ParticipantBadge, error) {
	return f.badges, nil
}

// badgeContentRepo mengembalikan baris konten badge; content nil = baris
// tidak ada (404 not_found, persis repo GORM).
type badgeContentRepo struct {
	repository.ContentRepository
	content *entity.Content
}

func (f *badgeContentRepo) GetContentByID(context.Context, string) (*entity.Content, error) {
	if f.content == nil {
		return nil, apperrors.NotFound("not_found", nil)
	}
	return f.content, nil
}

// badgeParticipantID dipakai report fixture agar keanggotaan badge bisa
// dipalsu untuk participant yang sama dengan token-nya.
const badgeParticipantID = "p-badge"

// newBadgeHandler membangun ReportHandler rute badge di atas fake (tanpa
// DB/network) dengan UploadDir = t.TempDir() supaya gerbang file berjalan
// terhadap file sungguhan.
func newBadgeHandler(t *testing.T, reportErr error, badges []entity.ParticipantBadge, content *entity.Content) (*handler.ReportHandler, *echo.Echo, *config.Config) {
	t.Helper()
	cfg := &config.Config{UploadDir: t.TempDir()}
	uc := reports.NewUsecase(
		&badgeReportRepo{
			report: &entity.Report{ParticipantID: badgeParticipantID, SessionID: "s-badge"},
			err:    reportErr,
		},
		nil,                                // gen
		nil,                                // aiClient
		nil,                                // missionRepo
		nil,                                // assessmentRepo
		nil,                                // sessionRepo (rute badge tidak membaca view)
		nil,                                // programRepo
		nil,                                // participantMissionRepo
		nil,                                // programSubstageRepo
		&badgeSubstageRepo{badges: badges}, // sessionSubstageRepo
		nil,                                // galleryRepo
		cfg,
		nil, // messaging
		nil, // userRepo
		nil, // attendanceRepo
	)
	h := handler.NewReportHandler(uc, cfg, nil, sse.NewHub(), nil, nil,
		&badgeContentRepo{content: content})
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	return h, e, cfg
}

// callBadge memanggil GetAccessBadge langsung dengan param path :contentId
// diset (pola SetPathValues seperti gallery/parent-token test).
func callBadge(e *echo.Echo, h *handler.ReportHandler, contentID, token string) (*httptest.ResponseRecorder, error) {
	target := "/api/reports/access/badge/" + contentID
	if token != "" {
		target += "?token=" + token
	}
	req := httptest.NewRequest(http.MethodGet, target, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "contentId", Value: contentID}})
	return rec, h.GetAccessBadge(c)
}

// badgeErrStatus memaksa err menjadi *apperrors.AppError untuk cek status HTTP.
func badgeErrStatus(t *testing.T, err error) int {
	t.Helper()
	var ae *apperrors.AppError
	if !errors.As(err, &ae) {
		t.Fatalf("expected *apperrors.AppError, got %T: %v", err, err)
	}
	return ae.StatusCode()
}

// TestGetAccessBadge_TokenInvalid: token kosong atau bukan 64-hex → 404
// token_invalid (spec §2.6) tanpa menyentuh repo — dan tanpa menulis body.
func TestGetAccessBadge_TokenInvalid(t *testing.T) {
	cases := []struct {
		name  string
		token string
	}{
		{"missing", ""},
		{"malformed", "not-a-64-hex-token"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h, e, _ := newBadgeHandler(t, nil, nil, nil)
			rec, err := callBadge(e, h, "content-1", tc.token)
			requireAppErrorCode(t, err, "token_invalid")
			if status := badgeErrStatus(t, err); status != http.StatusNotFound {
				t.Errorf("status = %d, want 404", status)
			}
			if rec.Body.Len() != 0 {
				t.Errorf("body = %q, want empty (error, bukan bytes)", rec.Body.String())
			}
		})
	}
}

// TestGetAccessBadge_UnknownToken: token 64-hex yang tidak dikenal repo
// report → error GetByToken diteruskan sebagai 404 token_invalid.
func TestGetAccessBadge_UnknownToken(t *testing.T) {
	h, e, _ := newBadgeHandler(t, apperrors.NotFound("token_invalid", nil), nil, nil)
	rec, err := callBadge(e, h, "content-1", parentToken64())
	requireAppErrorCode(t, err, "token_invalid")
	if status := badgeErrStatus(t, err); status != http.StatusNotFound {
		t.Errorf("status = %d, want 404", status)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("body = %q, want empty", rec.Body.String())
	}
}

// TestGetAccessBadge_NotOwned: contentId yang bukan milik participant report
// → 404 not_found sebelum repo konten dibaca (anti-IDOR keanggotaan badge).
func TestGetAccessBadge_NotOwned(t *testing.T) {
	badges := []entity.ParticipantBadge{{BadgeName: "Ahli Topik", BadgeImageURL: "someone-elses-content"}}
	h, e, _ := newBadgeHandler(t, nil, badges, &entity.Content{FileURL: "badges/content-1.png"})
	rec, err := callBadge(e, h, "content-1", parentToken64())
	requireAppErrorCode(t, err, "not_found")
	if status := badgeErrStatus(t, err); status != http.StatusNotFound {
		t.Errorf("status = %d, want 404", status)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("body = %q, want empty", rec.Body.String())
	}
}

// TestGetAccessBadge_OK: badge yang cocok + baris konten + file nyata di
// UploadDir → 200 berisi byte file dengan Content-Type image/png.
func TestGetAccessBadge_OK(t *testing.T) {
	badges := []entity.ParticipantBadge{{BadgeName: "Ahli Topik", BadgeImageURL: "content-1"}}
	h, e, cfg := newBadgeHandler(t, nil, badges, &entity.Content{FileURL: "badges/content-1.png"})

	dest := filepath.Join(cfg.UploadDir, "badges", "content-1.png")
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	want := []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 'b', 'a', 'd', 'g', 'e'}
	if err := os.WriteFile(dest, want, 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	rec, err := callBadge(e, h, "content-1", parentToken64())
	if err != nil {
		t.Fatalf("GetAccessBadge: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s, want 200", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", ct)
	}
	if rec.Body.Len() == 0 {
		t.Error("body kosong, want byte badge")
	}
}

// TestGetAccessBadge_HTMLBlocked: baris konten ber-ekstensi .html → 403
// file_type_blocked sebelum file dibaca (gerbang R10).
func TestGetAccessBadge_HTMLBlocked(t *testing.T) {
	badges := []entity.ParticipantBadge{{BadgeName: "Ahli Topik", BadgeImageURL: "content-1"}}
	h, e, _ := newBadgeHandler(t, nil, badges, &entity.Content{FileURL: "badges/content-1.html"})
	rec, err := callBadge(e, h, "content-1", parentToken64())
	requireAppErrorCode(t, err, "file_type_blocked")
	if status := badgeErrStatus(t, err); status != http.StatusForbidden {
		t.Errorf("status = %d, want 403", status)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("body = %q, want empty", rec.Body.String())
	}
}

// TestGetAccessBadge_EmptyFileURL: baris konten tanpa FileURL (atau baris
// yang hilang) → 404 not_found, bukan 500.
func TestGetAccessBadge_EmptyFileURL(t *testing.T) {
	badges := []entity.ParticipantBadge{{BadgeName: "Ahli Topik", BadgeImageURL: "content-1"}}
	cases := []struct {
		name    string
		content *entity.Content
	}{
		{"empty_file_url", &entity.Content{FileURL: ""}},
		{"missing_row", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h, e, _ := newBadgeHandler(t, nil, badges, tc.content)
			rec, err := callBadge(e, h, "content-1", parentToken64())
			requireAppErrorCode(t, err, "not_found")
			if status := badgeErrStatus(t, err); status != http.StatusNotFound {
				t.Errorf("status = %d, want 404", status)
			}
			if rec.Body.Len() != 0 {
				t.Errorf("body = %q, want empty", rec.Body.String())
			}
		})
	}
}
