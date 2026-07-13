package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/usecase"
)

// fakeSessionRepo is an in-memory SessionRepository for tests.
type fakeSessionRepo struct {
	sessions     map[string]*entity.Session
	groups       map[string]*entity.SessionGroup
	participants map[string]*entity.Participant
}

func newFakeSessionRepo() *fakeSessionRepo {
	return &fakeSessionRepo{
		sessions:     map[string]*entity.Session{},
		groups:       map[string]*entity.SessionGroup{},
		participants: map[string]*entity.Participant{},
	}
}

func (f *fakeSessionRepo) CreateSession(_ context.Context, s *entity.Session) error {
	if s.ID == "" {
		s.ID = uuid.NewString()
	}
	f.sessions[s.ID] = s
	return nil
}
func (f *fakeSessionRepo) GetSessionByID(_ context.Context, id, _ string) (*entity.Session, error) {
	if s, ok := f.sessions[id]; ok {
		return s, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeSessionRepo) ListSessions(_ context.Context, flt repository.SessionFilter, _, _ int) (*repository.Paginated[entity.Session], error) {
	out := make([]entity.Session, 0)
	for _, s := range f.sessions {
		if flt.TenantID != "" && (s.TenantID == nil || *s.TenantID != flt.TenantID) {
			continue
		}
		if flt.Status != "" && string(s.Status) != flt.Status {
			continue
		}
		if flt.Search != "" && !strings.Contains(s.Name, flt.Search) {
			continue
		}
		out = append(out, *s)
	}
	return &repository.Paginated[entity.Session]{Items: out, Total: len(out)}, nil
}
func (f *fakeSessionRepo) UpdateSession(_ context.Context, s *entity.Session) error {
	f.sessions[s.ID] = s
	return nil
}
func (f *fakeSessionRepo) DeleteSession(_ context.Context, id string) error {
	delete(f.sessions, id)
	return nil
}
func (f *fakeSessionRepo) CreateSessionStage(_ context.Context, s *entity.SessionStage) error {
	return nil
}
func (f *fakeSessionRepo) ListSessionStages(_ context.Context, _ string) ([]entity.SessionStage, error) {
	return nil, nil
}
func (f *fakeSessionRepo) UpdateSessionStage(_ context.Context, s *entity.SessionStage) error {
	return nil
}
func (f *fakeSessionRepo) CreateSessionGroup(_ context.Context, g *entity.SessionGroup) error {
	if g.ID == "" {
		g.ID = uuid.NewString()
	}
	f.groups[g.ID] = g
	return nil
}
func (f *fakeSessionRepo) GetSessionGroupByID(_ context.Context, id, _ string) (*entity.SessionGroup, error) {
	if g, ok := f.groups[id]; ok {
		return g, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeSessionRepo) ListSessionGroups(_ context.Context, _ string) ([]entity.SessionGroup, error) {
	out := make([]entity.SessionGroup, 0, len(f.groups))
	for _, g := range f.groups {
		out = append(out, *g)
	}
	return out, nil
}
func (f *fakeSessionRepo) UpdateSessionGroup(_ context.Context, g *entity.SessionGroup) error {
	f.groups[g.ID] = g
	return nil
}
func (f *fakeSessionRepo) DeleteSessionGroup(_ context.Context, id string) error {
	delete(f.groups, id)
	return nil
}
func (f *fakeSessionRepo) CreateGroupStageProgress(_ context.Context, p *entity.GroupStageProgress) error {
	return nil
}
func (f *fakeSessionRepo) ListGroupStageProgress(_ context.Context, _ string) ([]entity.GroupStageProgress, error) {
	return nil, nil
}
func (f *fakeSessionRepo) CreateParticipant(_ context.Context, p *entity.Participant) error {
	if p.ID == "" {
		p.ID = uuid.NewString()
	}
	f.participants[p.ID] = p
	return nil
}
func (f *fakeSessionRepo) GetParticipantByID(_ context.Context, id, _ string) (*entity.Participant, error) {
	if p, ok := f.participants[id]; ok {
		return p, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeSessionRepo) GetParticipantGlobal(_ context.Context, id, _ string) (*entity.Participant, error) {
	if p, ok := f.participants[id]; ok {
		return p, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeSessionRepo) ListParticipants(_ context.Context, _, _, _ string) ([]entity.Participant, error) {
	out := make([]entity.Participant, 0, len(f.participants))
	for _, p := range f.participants {
		out = append(out, *p)
	}
	return out, nil
}
func (f *fakeSessionRepo) ListParticipantsPaginated(_ context.Context, _, _, _, _ string, _, _ int) (*repository.Paginated[entity.Participant], error) {
	out := make([]entity.Participant, 0, len(f.participants))
	for _, p := range f.participants {
		out = append(out, *p)
	}
	return &repository.Paginated[entity.Participant]{Items: out, Total: len(out)}, nil
}
func (f *fakeSessionRepo) UpdateParticipant(_ context.Context, p *entity.Participant) error {
	f.participants[p.ID] = p
	return nil
}
func (f *fakeSessionRepo) DeleteParticipant(_ context.Context, id string) error {
	delete(f.participants, id)
	return nil
}
func (f *fakeSessionRepo) Transaction(_ context.Context, fn func(tx repository.SessionRepository) error) error {
	return fn(f)
}
func (f *fakeSessionRepo) TenantIDForSession(_ context.Context, _ string) (string, error) {
	return "", nil
}

func TestSessionCreateAndList(t *testing.T) {
	repo := newFakeSessionRepo()
	uc := usecase.NewSessionUsecase(repo)
	h := NewSessionHandler(uc)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()

	body := `{"program_id":"prog1","name":"Eksplorasi","session_date":"2026-07-20","location":"Lab A","notes":"catatan"}`
	req := httptest.NewRequest(http.MethodPost, "/api/sessions", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set("X-Tenant-Id", "tenant-1")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/sessions")
	c.Set(appmiddleware.CtxTenantID, "tenant-1")

	if err := h.Create(c); err != nil {
		t.Fatalf("Create err: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if env.Data.ID == "" || env.Data.Name != "Eksplorasi" {
		t.Fatalf("unexpected response: %+v", env.Data)
	}

	// List should return the created session for the same tenant.
	lreq := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	lrec := httptest.NewRecorder()
	lc := e.NewContext(lreq, lrec)
	lc.SetPath("/api/sessions")
	lc.Set(appmiddleware.CtxTenantID, "tenant-1")
	if err := h.List(lc); err != nil {
		t.Fatalf("List err: %v", err)
	}
	if lrec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", lrec.Code)
	}
	var lenv struct {
		Meta struct {
			Total int `json:"total"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(lrec.Body.Bytes(), &lenv); err != nil {
		t.Fatalf("bad list json: %v", err)
	}
	if lenv.Meta.Total != 1 {
		t.Fatalf("expected 1 session, got %d", lenv.Meta.Total)
	}
}
