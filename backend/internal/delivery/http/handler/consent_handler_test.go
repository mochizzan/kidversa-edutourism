package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/domain/entity"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
)

// fakeConsentRepo is an in-memory ConsentRepository for tests.
type fakeConsentRepo struct {
	rows []entity.ConsentLog
}

func (f *fakeConsentRepo) GetValue(_ context.Context, _, _ string, _ entity.ConsentType) (bool, error) {
	return false, nil
}
func (f *fakeConsentRepo) Create(_ context.Context, log *entity.ConsentLog) error {
	f.rows = append(f.rows, *log)
	return nil
}
func (f *fakeConsentRepo) Respond(_ context.Context, pid, sid string, ct entity.ConsentType, val bool, _, _ string) error {
	f.rows = append(f.rows, entity.ConsentLog{ParticipantID: pid, SessionID: sid, ConsentType: ct, Value: val})
	return nil
}
func (f *fakeConsentRepo) ListByParticipant(_ context.Context, pid string) ([]entity.ConsentLog, error) {
	out := make([]entity.ConsentLog, 0)
	for _, r := range f.rows {
		if r.ParticipantID == pid {
			out = append(out, r)
		}
	}
	return out, nil
}

func TestConsentRespondRecordsDecision(t *testing.T) {
	repo := &fakeConsentRepo{}
	h := NewConsentHandler(repo)

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"participant_id":"p1","session_id":"s1","consent_type":"PHOTO","value":true}`
	req := httptest.NewRequest(http.MethodPost, "/api/consent/respond", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/consent/respond")

	if err := h.Respond(c); err != nil {
		t.Fatalf("Respond err: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if len(repo.rows) != 1 || !repo.rows[0].Value {
		t.Fatalf("expected 1 recorded PHOTO consent=true, got %+v", repo.rows)
	}
}
