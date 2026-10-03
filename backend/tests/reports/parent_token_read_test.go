package reports_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	"kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

// parentToken64 adalah token parent 64-hex yang valid (lolos tokenFormat).
func parentToken64() string { return strings.Repeat("ab", 32) }

// seedParentToken menaruh token pada report yang sudah ada di fake repo
// (berbagi paket dengan delivery_status_test.go → field tak ter-eksport tetap
// terjangkau), sehingga jalur baca SCOPED-STAFF diuji dengan data ber-token.
func seedParentToken(t *testing.T, repo *genRepo, reportID, token string) {
	t.Helper()
	repo.mu.Lock()
	defer repo.mu.Unlock()
	r, ok := repo.byID[reportID]
	if !ok {
		t.Fatalf("fixture report %q tidak ada", reportID)
	}
	r.ParentAccessToken = token
	r.Status = entity.ReportSent
	repo.byID[reportID] = r
}

// TestListReportsCarriesParentAccessToken adalah regresi CACAT_SERVER utama:
// GET /api/reports (staff, JWT+tenant) harus memuat parent_access_token untuk
// data yang punya token — sebelumnya field itu json:"-" di entity sehingga
// tak pernah terkirim dan tombol salin/buka link orang tua tidak pernah muncul.
// Report tanpa token tetap mengirim kunci (string kosong), sesuai kontrak
// frontend Report.parent_access_token: string.
func TestListReportsCarriesParentAccessToken(t *testing.T) {
	token := parentToken64()
	repo := newGenRepo("p-a", "p-b")
	seedParentToken(t, repo, "r-p-a", token)

	h, e := newDeliveryHandlerFixture(repo, newBlockingGen(), &genSessionRepo{}, nil)
	data := listGET(t, h, e, testTenantID, genSessionID)

	var items []map[string]json.RawMessage
	if err := json.Unmarshal(data["items"], &items); err != nil {
		t.Fatalf("invalid items %s: %v", string(data["items"]), err)
	}
	if len(items) != 2 {
		t.Fatalf("items = %d, want 2", len(items))
	}
	byID := make(map[string]map[string]json.RawMessage, len(items))
	for _, it := range items {
		byID[jsonString(t, it["id"])] = it
	}

	sentItem, ok := byID["r-p-a"]
	if !ok {
		t.Fatal("report terkirim (r-p-a) tidak ada di list")
	}
	raw, ok := sentItem["parent_access_token"]
	if !ok {
		t.Fatalf("item dengan token harus memuat parent_access_token (keys=%v)", keysOf(sentItem))
	}
	if got := jsonString(t, raw); got != token {
		t.Errorf("parent_access_token = %q, want %q", got, token)
	}

	// Belum pernah dikirim → kunci tetap ada dengan string kosong.
	draftItem, ok := byID["r-p-b"]
	if !ok {
		t.Fatal("report DRAFT (r-p-b) tidak ada di list")
	}
	rawDraft, ok := draftItem["parent_access_token"]
	if !ok {
		t.Fatalf("item tanpa token tetap harus mengirim kunci (keys=%v)", keysOf(draftItem))
	}
	if got := jsonString(t, rawDraft); got != "" {
		t.Errorf("parent_access_token = %q, want \"\" (belum dikirim)", got)
	}
}

// TestReportResponseCarriesParentAccessTokenOnly: DTO baca tunggal staf
// (NewReportResponse → approve/missions/gallery-token) memuat token parent
// milik report, sedangkan kedaluwarsa/pencabutan token TIDAK ikut terkirim —
// distribusi dibatasi pada field yang dibutuhkan klien.
func TestReportResponseCarriesParentAccessTokenOnly(t *testing.T) {
	token := parentToken64()
	exp := time.Now().UTC().Add(time.Hour)
	r := &entity.Report{
		Status:               entity.ReportSent,
		ParentAccessToken:    token,
		ParentTokenExpiresAt: &exp,
		ParentTokenRevoked:   true,
	}
	r.ID = "r-1"

	raw, err := json.Marshal(dto.NewReportResponse(r))
	if err != nil {
		t.Fatalf("marshal ReportResponse: %v", err)
	}
	var wire map[string]json.RawMessage
	if err := json.Unmarshal(raw, &wire); err != nil {
		t.Fatalf("unmarshal ReportResponse: %v", err)
	}

	got, ok := wire["parent_access_token"]
	if !ok {
		t.Fatalf("ReportResponse harus memuat parent_access_token (keys=%v)", keysOf(wire))
	}
	if v := jsonString(t, got); v != token {
		t.Errorf("parent_access_token = %q, want %q", v, token)
	}
	if _, ok := wire["parent_token_expires_at"]; ok {
		t.Error("parent_token_expires_at tidak boleh ikut terkirim")
	}
	if _, ok := wire["parent_token_revoked"]; ok {
		t.Error("parent_token_revoked tidak boleh ikut terkirim")
	}
}

// TestEnsureGalleryTokenHandlerCarriesParentAccessToken: bukti level handler
// untuk jalur baca tunggal staf — POST /api/reports/:id/gallery-token (yang
// membalas NewReportResponse) juga membawa token parent di dalam envelope.
func TestEnsureGalleryTokenHandlerCarriesParentAccessToken(t *testing.T) {
	const galleryReportUUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	token := parentToken64()
	rep := tokenlessReport()
	rep.ID = galleryReportUUID
	rep.ParentAccessToken = token

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
			ParentAccessToken  string `json:"parent_access_token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v (body %s)", err, rec.Body.String())
	}
	if resp.Data.GalleryAccessToken == "" {
		t.Fatalf("gallery_access_token kosong (body %s)", rec.Body.String())
	}
	if resp.Data.ParentAccessToken != token {
		t.Errorf("data.parent_access_token = %q, want %q", resp.Data.ParentAccessToken, token)
	}
}
