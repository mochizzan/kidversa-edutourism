package auth_test

// POST /api/sessions/:id/cancel role guard (Tahap 3 step 10): cancel is
// restricted to ADMIN/KOORDINATOR/SUPER_ADMIN — a FASILITATOR cancelling the
// session would orphan in-flight grading/consent flows. The test wires the
// REAL RegisterSessionsRoutes chain (JWT → role → tenant scope → handler)
// exactly as router.go does and drives it over httptest; start/complete keep
// the wider gate (regression: FASILITATOR still reaches start).

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/usecase"
)

const cancelRoleSessionID = "11111111-1111-4111-8111-111111111111"

// cancelRoleRepo is a minimal SessionRepository fake holding one ACTIVE
// session (UUID id so the handler's bindUUID passes). Transaction runs fn
// against itself; stage cascade converges trivially (no stages).
type cancelRoleRepo struct {
	repository.SessionRepository
	session *entity.Session
}

func newCancelRoleRepo() *cancelRoleRepo {
	return &cancelRoleRepo{
		session: &entity.Session{
			BaseModel: entity.BaseModel{ID: cancelRoleSessionID},
			TenantID:  &cancelRoleTenant,
			ProgramID: "program-1",
			Status:    entity.SessionActive,
		},
	}
}

var cancelRoleTenant = "tenant-cancel-role"

func (r *cancelRoleRepo) GetSessionByID(_ context.Context, id, _ string) (*entity.Session, error) {
	cp := *r.session
	return &cp, nil
}

func (r *cancelRoleRepo) GetSessionByIDForUpdate(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	return r.GetSessionByID(ctx, id, tenantID)
}

func (r *cancelRoleRepo) UpdateSession(_ context.Context, s *entity.Session) error {
	r.session.Status = s.Status
	return nil
}

func (r *cancelRoleRepo) ListSessionStages(_ context.Context, _ string) ([]entity.SessionStage, error) {
	return nil, nil
}

func (r *cancelRoleRepo) UpdateSessionStage(_ context.Context, _ *entity.SessionStage) error {
	return nil
}

func (r *cancelRoleRepo) ClearParticipantTokens(_ context.Context, _, _ string) error {
	return nil
}

func (r *cancelRoleRepo) Transaction(_ context.Context, fn func(tx repository.SessionRepository) error) error {
	return fn(r)
}

type cancelRoleHarness struct {
	e  *echo.Echo
	jm *auth.JWTManager
}

func newCancelRoleHarness(t *testing.T) *cancelRoleHarness {
	t.Helper()
	cfg := &config.Config{
		JWTSecret:     "cancel-role-test-secret",
		JWTAccessTTL:  time.Hour,
		JWTRefreshTTL: time.Hour,
	}
	jm := auth.NewJWTManager(cfg)
	revoker := auth.NewInMemoryRevoker()
	t.Cleanup(revoker.Stop)

	sessionUC := usecase.NewSessionUsecase(newCancelRoleRepo(), nil)
	lh := handler.NewSessionLifecycleHandler(sessionUC)

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	e.HTTPErrorHandler = appmiddleware.ErrorHandler // sama seperti router produksi
	g := e.Group("/api/sessions")
	participants := e.Group("/api/participants")
	handler.RegisterSessionsRoutes(g,
		handler.NewSessionHandler(nil),
		lh,
		handler.NewSessionStageHandler(nil),
		handler.NewSessionGroupHandler(nil, nil),
		handler.NewSessionParticipantHandler(nil),
		handler.NewSessionParticipantBulkHandler(nil),
		jm, revoker,
		participants)

	return &cancelRoleHarness{e: e, jm: jm}
}

func (h *cancelRoleHarness) token(t *testing.T, role entity.UserRole) string {
	t.Helper()
	tenantID := cancelRoleTenant
	access, _, err := h.jm.Generate("user-cancel-role", &tenantID, string(role))
	if err != nil {
		t.Fatalf("generate access token: %v", err)
	}
	return access
}

func (h *cancelRoleHarness) post(t *testing.T, path, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	h.e.ServeHTTP(rec, req)
	return rec
}

// FASILITATOR must be rejected with 403 before reaching the handler.
func TestSessionCancel_FasilitatorForbidden(t *testing.T) {
	h := newCancelRoleHarness(t)
	rec := h.post(t, "/api/sessions/"+cancelRoleSessionID+"/cancel", h.token(t, entity.RoleFasilitator))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

// ADMIN, KOORDINATOR and SUPER_ADMIN (via JWT tenant) reach the handler.
func TestSessionCancel_AdminKoordinatorSuperAdminAllowed(t *testing.T) {
	for _, role := range []entity.UserRole{entity.RoleAdmin, entity.RoleKoordinator, entity.RoleSuperAdmin} {
		h := newCancelRoleHarness(t)
		rec := h.post(t, "/api/sessions/"+cancelRoleSessionID+"/cancel", h.token(t, role))
		if rec.Code != http.StatusOK {
			t.Errorf("role %s: expected 200, got %d: %s", role, rec.Code, rec.Body.String())
		}
	}
}

// Regression: FASILITATOR still reaches start/complete (only cancel narrowed).
func TestSessionStart_FasilitatorStillAllowed(t *testing.T) {
	h := newCancelRoleHarness(t)
	rec := h.post(t, "/api/sessions/"+cancelRoleSessionID+"/start", h.token(t, entity.RoleFasilitator))
	// The start gate rejects (no groups seeded → no_groups 400), which proves
	// the request PASSED the role middleware and reached the handler.
	if rec.Code == http.StatusForbidden {
		t.Fatalf("start must keep the wider role gate for FASILITATOR, got 403: %s", rec.Body.String())
	}
}
