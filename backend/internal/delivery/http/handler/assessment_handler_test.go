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
	assessmentuc "kidversa-edutourism-backend/internal/usecase/assessment"
)

// fakeAssessmentRepo is an in-memory AssessmentRepository for tests.
type fakeAssessmentRepo struct {
	byKey map[string]*entity.Assessment // key: participantID|sessionStageID
	byID  map[string]*entity.Assessment
}

func newFakeAssessmentRepo() *fakeAssessmentRepo {
	return &fakeAssessmentRepo{byKey: map[string]*entity.Assessment{}, byID: map[string]*entity.Assessment{}}
}

func (f *fakeAssessmentRepo) Create(_ context.Context, a *entity.Assessment) error {
	if a.ID == "" {
		a.ID = uuid.NewString()
	}
	k := a.ParticipantID + "|" + a.SessionStageID
	f.byKey[k] = a
	f.byID[a.ID] = a
	return nil
}
func (f *fakeAssessmentRepo) GetByID(_ context.Context, id string) (*entity.Assessment, error) {
	if a, ok := f.byID[id]; ok {
		return a, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeAssessmentRepo) GetByParticipantStage(_ context.Context, pid, ssid string) (*entity.Assessment, error) {
	if a, ok := f.byKey[pid+"|"+ssid]; ok {
		return a, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeAssessmentRepo) List(_ context.Context, fIn repository.AssessmentFilter, _, _ int) (*repository.Paginated[entity.Assessment], error) {
	out := make([]entity.Assessment, 0)
	for _, a := range f.byID {
		if fIn.ParticipantID != "" && a.ParticipantID != fIn.ParticipantID {
			continue
		}
		if fIn.SessionID != "" && a.SessionID != fIn.SessionID {
			continue
		}
		out = append(out, *a)
	}
	return &repository.Paginated[entity.Assessment]{Items: out, Total: len(out)}, nil
}
func (f *fakeAssessmentRepo) Update(_ context.Context, a *entity.Assessment) error {
	f.byID[a.ID] = a
	f.byKey[a.ParticipantID+"|"+a.SessionStageID] = a
	return nil
}
func (f *fakeAssessmentRepo) Delete(_ context.Context, id string) error {
	if a, ok := f.byID[id]; ok {
		delete(f.byKey, a.ParticipantID+"|"+a.SessionStageID)
		delete(f.byID, id)
	}
	return nil
}

func newTestAssessmentHandler() (*AssessmentHandler, *fakeAssessmentRepo) {
	repo := newFakeAssessmentRepo()
	uc := assessmentuc.NewUsecase(repo)
	return NewAssessmentHandler(uc), repo
}

func TestAssessmentUpsertCreates(t *testing.T) {
	h, _ := newTestAssessmentHandler()
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"participant_id":"p1","session_id":"s1","session_stage_id":"ss1","star_rating":4,"assessed_by":"u1"}`
	req := httptest.NewRequest(http.MethodPost, "/api/assessments/upsert", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/assessments/upsert")

	if err := h.Upsert(c); err != nil {
		t.Fatalf("Upsert err: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			ID         string `json:"id"`
			StarRating int    `json:"star_rating"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if env.Data.ID == "" || env.Data.StarRating != 4 {
		t.Fatalf("unexpected response: %+v", env.Data)
	}
}

func TestAssessmentUpsertInvalidRating(t *testing.T) {
	h, _ := newTestAssessmentHandler()
	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"participant_id":"p1","session_id":"s1","session_stage_id":"ss1","star_rating":9,"assessed_by":"u1"}`
	req := httptest.NewRequest(http.MethodPost, "/api/assessments/upsert", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/assessments/upsert")

	if err := h.Upsert(c); err != nil {
		t.Fatalf("Upsert err: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestAssessmentUsecaseUpsertThenUpdate(t *testing.T) {
	repo := newFakeAssessmentRepo()
	uc := assessmentuc.NewUsecase(repo)
	ctx := context.Background()
	a, err := uc.Upsert(ctx, repository.AssessmentFilter{ParticipantID: "p1", SessionID: "s1", SessionStageID: "ss1"}, 3, "", "u1", "", "")
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if a.StarRating != 3 {
		t.Fatalf("rating not set")
	}
	// Same key → update.
	b, err := uc.Upsert(ctx, repository.AssessmentFilter{ParticipantID: "p1", SessionID: "s1", SessionStageID: "ss1"}, 5, "great", "u1", "", "")
	if err != nil {
		t.Fatalf("upsert2: %v", err)
	}
	if b.ID != a.ID {
		t.Fatalf("expected same id on upsert")
	}
	if b.StarRating != 5 {
		t.Fatalf("expected updated rating 5, got %d", b.StarRating)
	}
}
