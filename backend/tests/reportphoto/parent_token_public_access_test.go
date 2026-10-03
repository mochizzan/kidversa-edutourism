package reportphoto_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/pkg/sse"
	reports "kidversa-edutourism-backend/internal/usecase/reports"
)

// newAccessHandlerWithParentToken membangun ulang rute publik
// GET /api/reports/access di atas fake berbagi-paket
// (access_photo_consent_test.go) untuk report yang MEMILIKI parent access
// token — token itu tidak boleh pernah masuk ke scope token-scoped ini,
// terlepas dari distribusi token pada respons baca staff.
func newAccessHandlerWithParentToken(token string) (*handler.ReportHandler, *echo.Echo) {
	cfg := &config.Config{UploadDir: "unused-consent-off"}
	reportRepo := &accessReportRepo{report: &entity.Report{
		ParticipantID:     testParticipantID,
		SessionID:         testSessionID,
		ProgramStageID:    testStageID,
		FacilitatorName:   "Bu Sari",
		ParentAccessToken: token,
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
		nil, // userRepo
		nil, // attendanceRepo
	)
	h := handler.NewReportHandler(uc, cfg, &accessSessionRepo{}, sse.NewHub(),
		&accessConsentRepo{granted: false}, &accessPhotoPanicRepo{}, nil)
	return h, echo.New()
}

// TestPublicAccessNeverLeaksParentAccessToken: GET /api/reports/access
// (publik, token-scoped) yang dijawab lewat PublicReportDTO tidak boleh
// membocorkan parent_access_token — baik kuncinya maupun nilai token mentah —
// meski report yang dilayani memilikinya.
func TestPublicAccessNeverLeaksParentAccessToken(t *testing.T) {
	token := accessToken64()
	h, e := newAccessHandlerWithParentToken(token)

	req := httptest.NewRequest(http.MethodGet, "/api/reports/access?token="+token, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.GetByAccessToken(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}

	body := rec.Body.String()
	// Payload publik tetap utuh — bukan error/halaman kosong.
	if !strings.Contains(body, "KIDVERSA") || !strings.Contains(body, "Budi") {
		t.Fatalf("payload rapor publik tidak lengkap: %s", body)
	}
	if strings.Contains(body, "parent_access_token") {
		t.Fatalf("scope publik tidak boleh membawa kunci parent_access_token: %s", body)
	}
	if strings.Contains(body, token) {
		t.Fatalf("scope publik tidak boleh membawa token mentah: %s", body)
	}
}
