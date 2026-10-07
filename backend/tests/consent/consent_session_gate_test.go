package consent_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

// Self-contained fakes for the session-status gates (audit #13): methods live
// in this file so the delivery fixtures stay untouched, and every write path
// the gates protect is counted (token writes, consent responses, sends).

type gateConsentRepo struct {
	repository.ConsentRepository
	participant  *entity.Participant
	respondCalls atomic.Int32
	sendReqCalls atomic.Int32
}

func (r *gateConsentRepo) GetParticipantByConsentToken(context.Context, string) (*entity.Participant, error) {
	if r.participant == nil {
		return nil, apperrors.NotFound("not_found", nil)
	}
	cp := *r.participant
	return &cp, nil
}

func (r *gateConsentRepo) GetConsentValue(context.Context, string, string, entity.ConsentType) (bool, error) {
	return false, nil
}

func (r *gateConsentRepo) RespondConsent(context.Context, string, string, entity.ConsentType, bool, string, string, string) error {
	r.respondCalls.Add(1)
	return nil
}

func (r *gateConsentRepo) SendConsentRequest(context.Context, string, string, entity.ConsentType) error {
	r.sendReqCalls.Add(1)
	return nil
}

type gateSessionRepo struct {
	repository.SessionRepository
	session      *entity.Session
	participants []entity.Participant
	tokenCalls   atomic.Int32
	fieldCalls   atomic.Int32
}

func (r *gateSessionRepo) GetSessionByID(context.Context, string, string) (*entity.Session, error) {
	return r.session, nil
}

func (r *gateSessionRepo) ListParticipants(context.Context, string, string, string) ([]entity.Participant, error) {
	return r.participants, nil
}

func (r *gateSessionRepo) GetParticipantByID(_ context.Context, id, _ string) (*entity.Participant, error) {
	for i := range r.participants {
		if r.participants[i].ID == id {
			cp := r.participants[i]
			return &cp, nil
		}
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *gateSessionRepo) UpdateParticipantTokenIfAvailable(context.Context, string, string, interface{}) (bool, error) {
	r.tokenCalls.Add(1)
	return true, nil
}

func (r *gateSessionRepo) ClearParticipantTokens(context.Context, string, string) error { return nil }

func (r *gateSessionRepo) UpdateParticipantFields(context.Context, string, map[string]interface{}) error {
	r.fieldCalls.Add(1)
	return nil
}

type gateMessenger struct{ sends atomic.Int32 }

func (m *gateMessenger) SendTextMessage(context.Context, string, string) error {
	m.sends.Add(1)
	return nil
}

func gateFixture(repo repository.ConsentRepository, sess *gateSessionRepo, msg repository.MessagingService) (*handler.ConsentHandler, *echo.Echo) {
	cfg := &config.Config{ConsentTokenTTL: time.Hour, ParentConsentBaseURL: "http://localhost/parent/consent"}
	h := handler.NewConsentHandler(repo, sess, msg, cfg, sse.NewHub())
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	return h, e
}

func gateSession(status entity.SessionStatus) *entity.Session {
	return &entity.Session{Name: "Sains", SessionDate: "2026-07-15", Location: "Jakarta", Status: status}
}

func gateParticipant() entity.Participant {
	sid := "session-gate"
	return entity.Participant{
		BaseModel:   entity.BaseModel{ID: "p-gate"},
		ChildName:   "Anak Pintar",
		ParentName:  "Ortu Pintar",
		ParentPhone: "+62 812 3456 7890",
		SessionID:   &sid,
	}
}

func requireGateCode(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error with code %q, got nil", want)
	}
	_, code, ok := apperrors.AsAppError(err)
	if !ok {
		t.Fatalf("expected AppError, got %v", err)
	}
	if code != want {
		t.Fatalf("error code = %q, want %q", code, want)
	}
}

func gatePost(e *echo.Echo, path, body string) *echo.Context {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, "tenant-gate")
	return c
}

// TestSendWhatsApp_SessionCancelled_Rejected: batch token issuance is refused
// for a CANCELLED session — no tokens persisted, no batch registered, no send.
func TestSendWhatsApp_SessionCancelled_Rejected(t *testing.T) {
	repo := &gateConsentRepo{}
	sess := &gateSessionRepo{session: gateSession(entity.SessionCancelled), participants: []entity.Participant{gateParticipant()}}
	msg := &gateMessenger{}
	h, e := gateFixture(repo, sess, msg)

	err := h.SendWhatsApp(gatePost(e, "/api/consent/send-whatsapp", `{"session_id":"session-gate"}`))
	requireGateCode(t, err, "session_not_active")

	if got := sess.tokenCalls.Load(); got != 0 {
		t.Fatalf("token writes = %d, want 0 (cancelled session)", got)
	}
	if got := repo.sendReqCalls.Load(); got != 0 {
		t.Fatalf("send-request audit rows = %d, want 0", got)
	}
	if got := msg.sends.Load(); got != 0 {
		t.Fatalf("whatsapp sends = %d, want 0", got)
	}
	if len(h.BatchRegistry().ActiveBatches("tenant-gate")) != 0 {
		t.Fatal("batch registered despite cancelled session")
	}
}

// TestSendSingle_SessionCancelled_Rejected: the single-participant send is
// refused BEFORE any token write or clear (force included).
func TestSendSingle_SessionCancelled_Rejected(t *testing.T) {
	repo := &gateConsentRepo{}
	sess := &gateSessionRepo{session: gateSession(entity.SessionCancelled), participants: []entity.Participant{gateParticipant()}}
	msg := &gateMessenger{}
	h, e := gateFixture(repo, sess, msg)

	err := h.SendSingle(gatePost(e, "/api/consent/send-whatsapp/single", `{"participant_id":"p-gate"}`))
	requireGateCode(t, err, "session_not_active")

	if got := sess.tokenCalls.Load(); got != 0 {
		t.Fatalf("token writes = %d, want 0 (cancelled session)", got)
	}
	if got := msg.sends.Load(); got != 0 {
		t.Fatalf("whatsapp sends = %d, want 0", got)
	}
}

// TestRespondCombined_SessionCancelled_Rejected: the public parent response is
// refused for a CANCELLED session — no consent_log row, no participant-field
// sync, the token stays intact.
func TestRespondCombined_SessionCancelled_Rejected(t *testing.T) {
	repo := &gateConsentRepo{participant: new(gateParticipant())}
	sess := &gateSessionRepo{session: gateSession(entity.SessionCancelled)}
	msg := &gateMessenger{}
	h, e := gateFixture(repo, sess, msg)

	err := h.RespondCombined(gatePost(e, "/api/consent/respond-combined", `{"token":"tok","photo":true,"responder_name":"Ibu"}`))
	requireGateCode(t, err, "session_not_active")

	if got := repo.respondCalls.Load(); got != 0 {
		t.Fatalf("consent responses recorded = %d, want 0", got)
	}
	if got := sess.fieldCalls.Load(); got != 0 {
		t.Fatalf("participant field updates = %d, want 0", got)
	}
}

// TestRespondCombined_SessionActive_RecordsConsent pins the deviation
// contract: only CANCELLED rejects — an ACTIVE session keeps recording the
// parent's response exactly as before.
func TestRespondCombined_SessionActive_RecordsConsent(t *testing.T) {
	repo := &gateConsentRepo{participant: new(gateParticipant())}
	sess := &gateSessionRepo{session: gateSession(entity.SessionActive)}
	msg := &gateMessenger{}
	h, e := gateFixture(repo, sess, msg)

	if err := h.RespondCombined(gatePost(e, "/api/consent/respond-combined", `{"token":"tok","photo":true,"responder_name":"Ibu"}`)); err != nil {
		t.Fatalf("RespondCombined on ACTIVE session = %v, want success", err)
	}
	if got := repo.respondCalls.Load(); got != 1 {
		t.Fatalf("consent responses = %d, want 1", got)
	}
	if got := sess.fieldCalls.Load(); got != 1 {
		t.Fatalf("participant field updates = %d, want 1", got)
	}
}

func gateInfo(e *echo.Echo, token string) (*echo.Context, *httptest.ResponseRecorder) {
	req := httptest.NewRequest(http.MethodGet, "/api/consent/info?token="+token, nil)
	rec := httptest.NewRecorder()
	return e.NewContext(req, rec), rec
}

func decodeInfoStatus(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var payload struct {
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
		Status string `json:"status"`
	}
	raw := rec.Body.String()
	// appresp.OK wraps in an envelope; accept either the envelope or a bare DTO.
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("Info body is not JSON: %v (%s)", err, raw)
	}
	if payload.Data.Status != "" {
		return payload.Data.Status
	}
	return payload.Status
}

// TestInfo_SessionCancelled_ReturnsCancelled: Info reports "cancelled" for a
// valid token whose session is CANCELLED (step 14) — the FE locks the form as
// an archive instead of offering a writable form that RespondCombined would
// reject with session_not_active.
func TestInfo_SessionCancelled_ReturnsCancelled(t *testing.T) {
	p := gateParticipant()
	repo := &gateConsentRepo{participant: new(p)}
	sess := &gateSessionRepo{session: gateSession(entity.SessionCancelled)}
	msg := &gateMessenger{}
	h, e := gateFixture(repo, sess, msg)

	c, rec := gateInfo(e, "tok")
	if err := h.Info(c); err != nil {
		t.Fatalf("Info = %v, want success", err)
	}
	if got := decodeInfoStatus(t, rec); got != "cancelled" {
		t.Fatalf("Info status = %q, want cancelled", got)
	}
}

// TestInfo_SessionActive_ReturnsOk pins the unchanged path: an ACTIVE session
// keeps status "ok" with the session snapshot attached.
func TestInfo_SessionActive_ReturnsOk(t *testing.T) {
	p := gateParticipant()
	repo := &gateConsentRepo{participant: new(p)}
	sess := &gateSessionRepo{session: gateSession(entity.SessionActive)}
	msg := &gateMessenger{}
	h, e := gateFixture(repo, sess, msg)

	c, rec := gateInfo(e, "tok")
	if err := h.Info(c); err != nil {
		t.Fatalf("Info = %v, want success", err)
	}
	if got := decodeInfoStatus(t, rec); got != "ok" {
		t.Fatalf("Info status = %q, want ok", got)
	}
}
