package reportphoto_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/pkg/sse"
	reports "kidversa-edutourism-backend/internal/usecase/reports"
)

// ── Fakes untuk rute orang tua (GET /api/reports/access + /access/photo) ─────
// Semua fake mem-bangun interface penuh via embedding (metode tak dipakai
// panik/bisa tak terimplementasi) sehingga jalur yang tereksekusi jelas.

// accessReportRepo mengembalikan satu report apa pun token yang diberikan.
type accessReportRepo struct {
	repository.ReportRepository
	report *entity.Report
}

func (f *accessReportRepo) GetByToken(context.Context, string) (*entity.Report, error) {
	return f.report, nil
}

// accessSessionRepo memenuhi BuildPublicReportView: peserta tanpa grup
// (skip lookup grup/user), sesi tanpa tenant (→ baca tenant-scoped
// dilewati), tanpa session stage (view.Stages kosong).
type accessSessionRepo struct {
	repository.SessionRepository
}

func (f *accessSessionRepo) GetParticipantByID(context.Context, string, string) (*entity.Participant, error) {
	p := &entity.Participant{ChildName: "Budi", ChildAge: 7}
	p.ID = testParticipantID
	return p, nil
}

func (f *accessSessionRepo) GetSessionByID(context.Context, string, string) (*entity.Session, error) {
	s := &entity.Session{ProgramID: "program-1", SessionDate: "2026-10-01"}
	s.ID = testSessionID
	return s, nil
}

func (f *accessSessionRepo) ListSessionStages(context.Context, string) ([]entity.SessionStage, error) {
	return nil, nil
}

// accessProgramRepo: program OK; Topik report tidak ada → topik "" (ditolerir).
type accessProgramRepo struct {
	repository.ProgramRepository
}

func (f *accessProgramRepo) GetProgramByID(context.Context, string) (*entity.Program, error) {
	return &entity.Program{Name: "KIDVERSA"}, nil
}

func (f *accessProgramRepo) GetStageByID(context.Context, string) (*entity.ProgramStage, error) {
	return nil, apperrors.NotFound("not_found", nil)
}

// accessSubstageRepo: tanpa kegiatan & tanpa badge.
type accessSubstageRepo struct {
	repository.SessionSubstageRepository
}

func (f *accessSubstageRepo) ListSessionSubstages(context.Context, string) ([]entity.SessionSubstage, error) {
	return nil, nil
}

func (f *accessSubstageRepo) ListBadgesByParticipant(context.Context, string, string) ([]entity.ParticipantBadge, error) {
	return nil, nil
}

// accessMissionRepo: kandidat misi kosong (report tanpa mission_ids →
// resolvePublicMissions tidak memanggil GetByID).
type accessMissionRepo struct {
	repository.MissionBankRepository
}

func (f *accessMissionRepo) List(context.Context, repository.MissionBankFilter, int, int) (*repository.Paginated[entity.MissionBank], error) {
	return &repository.Paginated[entity.MissionBank]{}, nil
}

// accessConsentRepo menentukan hasil gerbang consent untuk kedua rute.
type accessConsentRepo struct {
	repository.ConsentRepository
	granted bool
}

func (f *accessConsentRepo) GetConsentValue(context.Context, string, string, entity.ConsentType) (bool, error) {
	return f.granted, nil
}

// accessPhotoPanicRepo BUKAN untuk dipanggil: dengan consent OFF, gerbang
// harus berhenti sebelum resolver foto — setiap panggilan = kegagalan tes.
type accessPhotoPanicRepo struct {
	repository.PhotoRepository
}

func (f *accessPhotoPanicRepo) GetReportPhotoPick(context.Context, string, string, string) (*entity.ReportPhotoPick, error) {
	panic("photo repo dipanggil meski consent OFF — gerbang harus mendahului resolver")
}

func (f *accessPhotoPanicRepo) ListPhotos(context.Context, repository.PhotoFilter, int, int) (*repository.Paginated[entity.SmartPhoto], error) {
	panic("photo repo dipanggil meski consent OFF — gerbang harus mendahului resolver")
}

// newAccessHandler membangun ReportHandler rute orang tua di atas fake di
// atas (tanpa DB/network) dengan consent sesuai skenario.
func newAccessHandler(consentGranted bool) (*handler.ReportHandler, *echo.Echo) {
	cfg := &config.Config{UploadDir: "unused-consent-off"}
	reportRepo := &accessReportRepo{report: &entity.Report{
		ParticipantID:   testParticipantID,
		SessionID:       testSessionID,
		ProgramStageID:  testStageID,
		FacilitatorName: "Bu Sari",
	}}
	uc := reports.NewUsecase(
		reportRepo,
		nil,                   // gen (tidak dipakai rute akses)
		nil,                   // aiClient
		&accessMissionRepo{},  // missionRepo
		nil,                   // assessmentRepo (tenant "" → dilewati)
		&accessSessionRepo{},  // sessionRepo (usecase view)
		&accessProgramRepo{},  // programRepo
		nil,                   // participantMissionRepo
		nil,                   // programSubstageRepo
		&accessSubstageRepo{}, // sessionSubstageRepo
		nil,                   // galleryRepo
		cfg,
		nil, // messaging
		nil, // userRepo (facilitator name sudah terisi report)
		nil, // attendanceRepo (rute akses tidak memakai generate)
	)
	h := handler.NewReportHandler(uc, cfg, &accessSessionRepo{}, sse.NewHub(),
		&accessConsentRepo{granted: consentGranted}, &accessPhotoPanicRepo{}, nil)
	return h, echo.New()
}

// accessToken64 menghasilkan token 64-hex yang lolos tokenFormat.
func accessToken64() string { return strings.Repeat("ab", 32) }

// TestGetByAccessToken_ConsentOff: foto TANPA consent bukan error — rute
// menjawab 200 dengan photo_url di-omitted (kondisi eksplisit, bukan 500) dan
// resolver foto tidak pernah dijalankan (repo foto = panik bila tersentuh).
func TestGetByAccessToken_ConsentOff(t *testing.T) {
	h, e := newAccessHandler(false)

	req := httptest.NewRequest(http.MethodGet, "/api/reports/access?token="+accessToken64(), nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.GetByAccessToken(c); err != nil {
		t.Fatalf("consent OFF harus bukan error, got: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (bukan 500)", rec.Code)
	}
	body := rec.Body.String()
	if strings.Contains(body, "photo_url") {
		t.Fatalf("photo_url harus absent (omitempty) saat consent OFF: %s", body)
	}
	// Payload mini-raport tetap utuh agar placeholder klien tetap dirender.
	if !strings.Contains(body, "KIDVERSA") || !strings.Contains(body, "Budi") {
		t.Fatalf("payload rapor tidak lengkap: %s", body)
	}
}

// TestGetAccessPhoto_ConsentOff: gerbang consent menghasilkan AppError
// consent_required berstatus 403 — kondisi eksplisit, bukan 500 — dan berhenti
// SEBELUM resolver foto (repo foto akan panik bila tersentuh).
func TestGetAccessPhoto_ConsentOff(t *testing.T) {
	h, e := newAccessHandler(false)

	req := httptest.NewRequest(http.MethodGet, "/api/reports/access/photo?token="+accessToken64(), nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.GetAccessPhoto(c)
	requireAppErrorCode(t, err, "consent_required")

	var ae *apperrors.AppError
	if !errors.As(err, &ae) {
		t.Fatalf("expected *apperrors.AppError, got %T: %v", err, err)
	}
	if status := ae.StatusCode(); status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (bukan 500)", status)
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("handler tidak boleh menulis body saat mengembalikan error, got: %s", rec.Body.String())
	}
}
