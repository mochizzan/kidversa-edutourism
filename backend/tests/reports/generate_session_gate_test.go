package reports_test

// Session-status gates on the report generation paths (audit #13): both the
// handler (sync 403 before the detached run) and the usecase (write point —
// the worker re-reads the session) reject a CANCELLED session with
// session_not_active before a single report row or narrative changes. Only
// CANCELLED rejects: DRAFT/ACTIVE/COMPLETED keep their pre-audit behavior.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
)

func cancelledGenSessionRepo() *genSessionRepo {
	s := &genSessionRepo{participants: newParticipants(1)}
	s.status = entity.SessionCancelled
	return s
}

// TestGenerateForSessionHandler_SessionCancelled_Rejected: the POST answers
// with session_not_active instead of a detached 202, and no report row exists.
func TestGenerateForSessionHandler_SessionCancelled_Rejected(t *testing.T) {
	repo := newGenRepo()
	gen := newBlockingGen()
	h, e := newDeliveryHandlerFixture(repo, gen, cancelledGenSessionRepo(), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/reports/generate",
		strings.NewReader(`{"session_id":"`+genSessionID+`"}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set(appmiddleware.CtxTenantID, testTenantID)

	requireAppErrorCode(t, h.GenerateForSession(c), "session_not_active")
	if n := len(reportRowCountByParticipant(repo)); n != 0 {
		t.Fatalf("report rows = %d, want 0 (cancelled session)", n)
	}
}

// TestGenerateForSessionUsecase_SessionCancelled_Rejected: the write point
// itself rejects — a run queued before a cancel never creates a row or enters
// the registry.
func TestGenerateForSessionUsecase_SessionCancelled_Rejected(t *testing.T) {
	repo := newGenRepo()
	uc := newUsecaseFixture(repo, newBlockingGen(), cancelledGenSessionRepo(), nil)

	_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID,
		newParticipants(2), []string{"stage1"})
	requireAppErrorCode(t, err, "session_not_active")

	if n := len(reportRowCountByParticipant(repo)); n != 0 {
		t.Fatalf("report rows = %d, want 0 (cancelled session)", n)
	}
	if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
		t.Fatal("generate registry entry created despite cancelled session")
	}
}

// TestGenerateForSessionUsecase_NonCancelled_Allowed pins the deviation
// contract: DRAFT/ACTIVE/COMPLETED (and the legacy "" status) keep generating
// — the narrative is persisted exactly as before the audit gate.
func TestGenerateForSessionUsecase_NonCancelled_Allowed(t *testing.T) {
	for _, status := range []entity.SessionStatus{"", entity.SessionDraft, entity.SessionActive, entity.SessionCompleted} {
		repo := newGenRepo("p-a")
		sess := &genSessionRepo{participants: newParticipants(1)}
		sess.status = status
		uc := newUsecaseFixture(repo, newBlockingGen(), sess, nil)

		if _, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID,
			newParticipants(1), nil); err != nil {
			t.Fatalf("session status %q: GenerateForSession = %v, want success (CANCELLED-only gate)", status, err)
		}
		if repo.updateHits == 0 {
			t.Fatalf("session status %q: narrative never persisted", status)
		}
	}
}

// TestGenerateStreamHandler_SessionCancelled_Rejected: per-report narrative
// regeneration is refused before the detached worker starts; nothing is
// persisted.
func TestGenerateStreamHandler_SessionCancelled_Rejected(t *testing.T) {
	repo := newGenRepo()
	repo.addReport(sendReport1, "p-a")
	gen := newBlockingGen()
	h, e := newDeliveryHandlerFixture(repo, gen, cancelledGenSessionRepo(), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/reports/"+sendReport1+"/generate/stream", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: sendReport1}})
	c.Set(appmiddleware.CtxTenantID, testTenantID)

	requireAppErrorCode(t, h.GenerateStream(c), "session_not_active")
	if repo.updateHits != 0 {
		t.Fatalf("report updated %d time(s) despite cancelled session", repo.updateHits)
	}
}

// TestStreamNarrativeUsecase_SessionCancelled_Rejected: the narrative write
// point rejects a cancelled session even if the run was queued earlier.
func TestStreamNarrativeUsecase_SessionCancelled_Rejected(t *testing.T) {
	repo := newGenRepo("p-a")
	uc := newUsecaseFixture(repo, newBlockingGen(), cancelledGenSessionRepo(), nil)

	_, err := uc.StreamNarrative(context.Background(), "r-p-a", testTenantID, true,
		func(string) error { return nil })
	requireAppErrorCode(t, err, "session_not_active")
	if repo.updateHits != 0 {
		t.Fatalf("narrative persisted %d time(s) despite cancelled session", repo.updateHits)
	}
}
