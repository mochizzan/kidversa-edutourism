package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/google/uuid"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/pkg/sse"
	reportsuc "kidversa-edutourism-backend/internal/usecase/reports"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
)

// shared test sentinels (repoErrNotFound already declared in auth_handler_test.go).
var repoErrForbidden = errors.New("forbidden")

// mustHub returns a fresh in-memory SSE hub for tests.
func mustHub() *sse.Hub { return sse.NewHub() }

// fakeReportRepo is an in-memory ReportRepository for tests.
type fakeReportRepo struct {
	byToken map[string]*entity.Report
	byID    map[string]*entity.Report
}

func newFakeReportRepo() *fakeReportRepo {
	return &fakeReportRepo{byToken: map[string]*entity.Report{}, byID: map[string]*entity.Report{}}
}

func (f *fakeReportRepo) Create(_ context.Context, r *entity.Report) error {
	if r.ID == "" {
		r.ID = uuid.NewString()
	}
	f.byID[r.ID] = r
	return nil
}
func (f *fakeReportRepo) GetByID(_ context.Context, id string) (*entity.Report, error) {
	r, ok := f.byID[id]
	if !ok {
		return nil, repoErrNotFound
	}
	return r, nil
}
func (f *fakeReportRepo) GetByToken(_ context.Context, token string) (*entity.Report, error) {
	r, ok := f.byToken[token]
	if !ok {
		return nil, repoErrNotFound
	}
	if r.ParentTokenRevoked {
		return nil, repoErrForbidden
	}
	return r, nil
}
func (f *fakeReportRepo) List(_ context.Context, _ repository.ReportFilter, _, _ int) (*repository.Paginated[entity.Report], error) {
	return &repository.Paginated[entity.Report]{}, nil
}
func (f *fakeReportRepo) Update(_ context.Context, r *entity.Report) error {
	f.byID[r.ID] = r
	if r.ParentAccessToken != "" {
		f.byToken[r.ParentAccessToken] = r
	}
	return nil
}
func (f *fakeReportRepo) Delete(_ context.Context, id string) error {
	delete(f.byID, id)
	return nil
}

func newTestReportHandler() (*ReportHandler, *fakeReportRepo) {
	repo := newFakeReportRepo()
	uc := reportsuc.NewUsecase(repo, mustHub(), reportsuc.NewPlaceholderNarrative())
	return NewReportHandler(uc), repo
}

func TestReportPublicAccessRejectsBadToken(t *testing.T) {
	h, _ := newTestReportHandler()
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	req := httptest.NewRequest(http.MethodGet, "/api/reports/access?token=nope", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/reports/access")

	// Unknown token → handler must return a non-nil error (a real server maps this
	// to 404 via the error middleware; here we assert the refusal signal).
	err := h.GetByAccessToken(c)
	if err == nil {
		t.Fatalf("expected error for unknown token, got nil")
	}
}

func TestReportSendGeneratesTokenThenPublicAccessOK(t *testing.T) {
	h, repo := newTestReportHandler()
	r := &entity.Report{BaseModel: entity.BaseModel{ID: uuid.NewString()}, ParticipantID: "p1", SessionID: "s1", Status: entity.ReportApproved}
	_ = repo.Create(context.Background(), r)

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"ttl_hours":48}`
	req := httptest.NewRequest(http.MethodPost, "/api/reports/"+r.ID+"/send", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/reports/:id/send")
	c.SetPathValues(echo.PathValues{{Name: "id", Value: r.ID}})

	if err := h.Send(c); err != nil {
		t.Fatalf("Send err: %v", err)
	}

	var env struct {
		Data dto.ReportTokenResponse `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if len(env.Data.ParentAccessToken) != 64 {
		t.Fatalf("expected 64-hex token, got len %d", len(env.Data.ParentAccessToken))
	}

	req2 := httptest.NewRequest(http.MethodGet, "/api/reports/access?token="+env.Data.ParentAccessToken, nil)
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)
	c2.SetPath("/api/reports/access")
	if err := h.GetByAccessToken(c2); err != nil {
		t.Fatalf("access err: %v", err)
	}
	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200 on token access, got %d", rec2.Code)
	}
}
