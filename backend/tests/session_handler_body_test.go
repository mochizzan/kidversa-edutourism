package auth_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
)

// TestCreateSession_InvalidBodyStops: bindAndValidate writes the 400 envelope
// itself and returns nil — the handler must stop at the Committed check and
// never reach CreateSession. The recorder must hold exactly ONE valid JSON
// envelope (a continued handler would append a second write and corrupt it).
func TestCreateSession_InvalidBodyStops(t *testing.T) {
	sessRepo := &fakeCreateGateSessionRepo{}
	uc := newCreateGateUsecase(sessRepo, false, nil, nil)
	h := handler.NewSessionHandler(uc)

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	req := httptest.NewRequest(http.MethodPost, "/api/sessions", strings.NewReader("{not json"))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.Create(c); err != nil {
		t.Fatalf("handler must swallow the already-written 400, got %v", err)
	}
	if sessRepo.created {
		t.Fatal("session persisted despite invalid body")
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !json.Valid(rec.Body.Bytes()) {
		t.Fatalf("response is not a single valid JSON value (appended write?): %s", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"code":"invalid_body"`) {
		t.Fatalf("expected invalid_body envelope, got: %s", rec.Body.String())
	}
}

// TestCreateSession_ValidBodyPersists: the Committed stop must only fire on a
// rejected body — a valid payload still reaches CreateSession.
func TestCreateSession_ValidBodyPersists(t *testing.T) {
	sessRepo := &fakeCreateGateSessionRepo{}
	// Complete program so the strict create gate passes (mirror of
	// TestCreateSession_CompleteProgram_Succeeds).
	stages := []entity.ProgramStage{stageWithID("stage-1"), stageWithID("stage-2")}
	subs := map[string][]entity.ProgramSubstage{
		"stage-1": {subWithID("sub-1", "stage-1")},
		"stage-2": {subWithID("sub-2", "stage-2")},
	}
	uc := newCreateGateUsecase(sessRepo, true, stages, subs)
	h := handler.NewSessionHandler(uc)

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"program_id":"program-1","name":"Sesi","session_date":"2026-09-30","location":"Ruang 1"}`
	req := httptest.NewRequest(http.MethodPost, "/api/sessions", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.Create(c); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if !sessRepo.created {
		t.Fatal("valid body did not reach CreateSession")
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
}
