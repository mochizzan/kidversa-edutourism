package reports_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	"kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/reports"
)

// fakeGalleryRepo records minted gallery_tokens rows and can be forced to
// fail via createErr (mint failure path).
type fakeGalleryRepo struct {
	repository.GalleryTokenRepository
	created   []*entity.GalleryToken
	createErr error
}

func (f *fakeGalleryRepo) Create(_ context.Context, t *entity.GalleryToken) error {
	if f.createErr != nil {
		return f.createErr
	}
	f.created = append(f.created, new(*t))
	return nil
}

const galleryTestTTL = 7 * 24 * time.Hour

// newGalleryFixture wires a Usecase over the in-memory report repo (send_test)
// plus a recording gallery repo.
func newGalleryFixture(rep *entity.Report) (*reports.Usecase, *fakeReportRepo, *fakeGalleryRepo) {
	reportRepo := &fakeReportRepo{report: rep}
	galleryRepo := &fakeGalleryRepo{}
	cfg := &config.Config{GalleryTokenTTL: galleryTestTTL}
	uc := reports.NewUsecase(reportRepo, nil, nil, nil, nil, nil, nil, nil, nil, nil, galleryRepo, cfg, nil, nil)
	return uc, reportRepo, galleryRepo
}

// tokenlessReport is a report that never went through Approve (DRAFT preview)
// or was approved before the gallery feature existed: no gallery token anywhere.
func tokenlessReport() *entity.Report {
	rep := &entity.Report{
		ParticipantID: "participant-1",
		SessionID:     "session-1",
		Status:        entity.ReportDraft,
	}
	rep.ID = testReportID
	return rep
}

// TestEnsureGalleryTokenMintsForReportWithoutToken is the regression for the
// missing admin-preview QR footer: the ONLY mint path used to be Approve, so a
// report previewed before approval (or approved before the gallery feature)
// carried gallery_access_token="" and the QR silently rendered the
// "[ QR CODE ]" placeholder. Ensure must mint + persist a full 64-hex token
// where none existed.
func TestEnsureGalleryTokenMintsForReportWithoutToken(t *testing.T) {
	uc, reportRepo, galleryRepo := newGalleryFixture(tokenlessReport())

	r, err := uc.EnsureGalleryToken(context.Background(), testReportID, testTenantID)
	if err != nil {
		t.Fatalf("EnsureGalleryToken() error: %v", err)
	}
	if r.GalleryAccessToken == "" {
		t.Fatal("expected a minted gallery token, got empty string")
	}
	if len(r.GalleryAccessToken) != 64 {
		t.Errorf("token = %q (len %d), want 64 hex chars — the QR payload must be a full gallery token",
			r.GalleryAccessToken, len(r.GalleryAccessToken))
	}

	if len(galleryRepo.created) != 1 {
		t.Fatalf("expected exactly 1 gallery_tokens row, got %d", len(galleryRepo.created))
	}
	row := galleryRepo.created[0]
	if row.ReportID != testReportID || row.ParticipantID != "participant-1" ||
		row.SessionID != "session-1" || row.TenantID != testTenantID {
		t.Errorf("gallery_tokens row scoped wrong: %+v", row)
	}
	if want := time.Now().Add(galleryTestTTL); row.ExpiresAt.Before(want.Add(-time.Minute)) ||
		row.ExpiresAt.After(want.Add(time.Minute)) {
		t.Errorf("ExpiresAt = %v, want ≈ now+%s", row.ExpiresAt, galleryTestTTL)
	}

	if len(reportRepo.updates) == 0 {
		t.Fatal("expected the token to be persisted on the report row")
	}
	last := reportRepo.updates[len(reportRepo.updates)-1]
	if last.GalleryAccessToken != r.GalleryAccessToken {
		t.Errorf("persisted gallery_access_token = %q, want %q", last.GalleryAccessToken, r.GalleryAccessToken)
	}
	if last.GalleryTokenExpiresAt == nil {
		t.Error("persisted gallery_token_expires_at must be set alongside the token")
	}
}

// TestEnsureGalleryTokenKeepsValidToken: a report with a live token is
// returned as-is — no re-mint, no extra gallery_tokens row, no write.
func TestEnsureGalleryTokenKeepsValidToken(t *testing.T) {
	rep := tokenlessReport()
	rep.GalleryAccessToken = "existing-token"
	rep.GalleryTokenExpiresAt = new(time.Now().UTC().Add(time.Hour))
	uc, reportRepo, galleryRepo := newGalleryFixture(rep)

	r, err := uc.EnsureGalleryToken(context.Background(), testReportID, testTenantID)
	if err != nil {
		t.Fatalf("EnsureGalleryToken() error: %v", err)
	}
	if r.GalleryAccessToken != "existing-token" {
		t.Errorf("token = %q, want the existing one untouched", r.GalleryAccessToken)
	}
	if len(galleryRepo.created) != 0 {
		t.Errorf("expected no re-mint for a valid token, got %d rows", len(galleryRepo.created))
	}
	if len(reportRepo.updates) != 0 {
		t.Errorf("expected no persist for a valid token, got %d updates", len(reportRepo.updates))
	}
}

// TestEnsureGalleryTokenRemintsExpiredToken: an expired token renders a QR
// that can only 404 on scan — Ensure must replace it with a fresh one.
func TestEnsureGalleryTokenRemintsExpiredToken(t *testing.T) {
	rep := tokenlessReport()
	rep.GalleryAccessToken = "stale-token"
	rep.GalleryTokenExpiresAt = new(time.Now().UTC().Add(-time.Hour))
	uc, reportRepo, galleryRepo := newGalleryFixture(rep)

	r, err := uc.EnsureGalleryToken(context.Background(), testReportID, testTenantID)
	if err != nil {
		t.Fatalf("EnsureGalleryToken() error: %v", err)
	}
	if r.GalleryAccessToken == "" || r.GalleryAccessToken == "stale-token" {
		t.Errorf("token = %q, want a fresh mint replacing the expired one", r.GalleryAccessToken)
	}
	if len(galleryRepo.created) != 1 {
		t.Fatalf("expected a re-mint (1 gallery_tokens row), got %d", len(galleryRepo.created))
	}
	last := reportRepo.updates[len(reportRepo.updates)-1]
	if last.GalleryAccessToken != r.GalleryAccessToken {
		t.Errorf("persisted gallery_access_token = %q, want %q", last.GalleryAccessToken, r.GalleryAccessToken)
	}
}

// TestEnsureGalleryTokenSurfacesMintFailure: a failed mint must NOT be
// silent — the caller receives an error (→ HTTP 500 → admin toast) and the
// report row is left untouched instead of handing out an unpersisted token.
func TestEnsureGalleryTokenSurfacesMintFailure(t *testing.T) {
	uc, reportRepo, galleryRepo := newGalleryFixture(tokenlessReport())
	galleryRepo.createErr = errors.New("db down")

	_, err := uc.EnsureGalleryToken(context.Background(), testReportID, testTenantID)
	requireAppErrorCode(t, err, "internal_error")
	if len(reportRepo.updates) != 0 {
		t.Errorf("report must not be written when the mint fails, got %d updates", len(reportRepo.updates))
	}
}

// TestApproveMintsGalleryToken pins the shared mint helper on the approve
// path: approval still auto-generates the QR gallery token (and a failure is
// now logged instead of silently skipping the whole block).
func TestApproveMintsGalleryToken(t *testing.T) {
	rep := tokenlessReport()
	reportRepo := &fakeReportRepo{report: rep}
	galleryRepo := &fakeGalleryRepo{}
	sessionRepo := &fakeSessionRepo{
		participant: &entity.Participant{ChildName: "Budi", ParentPhone: "+62 812-3456-7890"},
		session:     &entity.Session{Name: "Sesi Pagi"},
	}
	cfg := &config.Config{GalleryTokenTTL: galleryTestTTL}
	uc := reports.NewUsecase(reportRepo, nil, nil, nil, nil, sessionRepo, nil, nil, nil, nil, galleryRepo, cfg, nil, nil)

	r, err := uc.Approve(context.Background(), testReportID, testTenantID, "user-1", "", nil)
	if err != nil {
		t.Fatalf("Approve() error: %v", err)
	}
	if r.Status != entity.ReportApproved {
		t.Errorf("status = %q, want APPROVED", r.Status)
	}
	if r.GalleryAccessToken == "" {
		t.Fatal("expected a gallery token minted on approve")
	}
	if len(galleryRepo.created) != 1 {
		t.Fatalf("expected exactly 1 gallery_tokens row, got %d", len(galleryRepo.created))
	}
}

// TestEnsureGalleryTokenHandlerEnvelope proves the HTTP contract the admin
// preview consumes: POST /api/reports/:id/gallery-token answers with the
// minted gallery_access_token inside the standard `data` envelope — the exact
// payload buildRaportHtml needs to encode the QR footer. (Path param must be a
// UUID: bindUUID rejects anything else.)
func TestEnsureGalleryTokenHandlerEnvelope(t *testing.T) {
	const galleryReportUUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	rep := tokenlessReport()
	rep.ID = galleryReportUUID
	uc, _, _ := newGalleryFixture(rep)
	h := handler.NewReportHandler(uc, &config.Config{GalleryTokenTTL: galleryTestTTL}, nil, sse.NewHub(), nil, nil)
	e := echo.New()

	req := httptest.NewRequest(http.MethodPost, "/api/reports/"+galleryReportUUID+"/gallery-token", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: galleryReportUUID}})
	c.Set(middleware.CtxTenantID, testTenantID)

	if err := h.EnsureGalleryToken(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Data struct {
			GalleryAccessToken string `json:"gallery_access_token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v (body %s)", err, rec.Body.String())
	}
	if resp.Data.GalleryAccessToken == "" {
		t.Fatalf("response data.gallery_access_token is empty — the admin preview would render no QR (body %s)", rec.Body.String())
	}
}
