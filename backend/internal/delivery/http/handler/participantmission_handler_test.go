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
)

// fakeParticipantMissionRepo is an in-memory ParticipantMissionRepository.
type fakeParticipantMissionRepo struct {
	byID     map[string]*entity.ParticipantMission
	byReport map[string][]*entity.ParticipantMission
}

func newFakeParticipantMissionRepo() *fakeParticipantMissionRepo {
	return &fakeParticipantMissionRepo{byID: map[string]*entity.ParticipantMission{}, byReport: map[string][]*entity.ParticipantMission{}}
}

func (f *fakeParticipantMissionRepo) Create(_ context.Context, m *entity.ParticipantMission) error {
	f.byID[m.ID] = m
	f.byReport[m.ReportID] = append(f.byReport[m.ReportID], m)
	return nil
}
func (f *fakeParticipantMissionRepo) GetByID(_ context.Context, id string) (*entity.ParticipantMission, error) {
	if m, ok := f.byID[id]; ok {
		return m, nil
	}
	return nil, repoErrNotFound
}
func (f *fakeParticipantMissionRepo) GetByReport(_ context.Context, reportID string) ([]entity.ParticipantMission, error) {
	out := make([]entity.ParticipantMission, 0)
	for _, m := range f.byReport[reportID] {
		out = append(out, *m)
	}
	return out, nil
}
func (f *fakeParticipantMissionRepo) Update(_ context.Context, m *entity.ParticipantMission) error {
	f.byID[m.ID] = m
	return nil
}
func (f *fakeParticipantMissionRepo) Delete(_ context.Context, id string) error {
	delete(f.byID, id)
	return nil
}
func (f *fakeParticipantMissionRepo) ReplaceByReport(_ context.Context, reportID string, items []entity.ParticipantMission) error {
	for k, v := range f.byID {
		if v.ReportID == reportID {
			delete(f.byID, k)
		}
	}
	for i := range items {
		items[i].ID = uuid.NewString()
		f.byID[items[i].ID] = &items[i]
	}
	return nil
}
func (f *fakeParticipantMissionRepo) ListByParticipant(_ context.Context, participantID string) ([]entity.ParticipantMission, error) {
	out := make([]entity.ParticipantMission, 0)
	for _, v := range f.byID {
		if v.ParticipantID == participantID {
			out = append(out, *v)
		}
	}
	return out, nil
}

func TestParticipantMissionToggleFlipsCompletion(t *testing.T) {
	repo := newFakeParticipantMissionRepo()
	h := NewParticipantMissionHandler(repo)
	m := &entity.ParticipantMission{BaseModel: entity.BaseModel{ID: uuid.NewString()}, ParticipantID: "p1", ReportID: "r1", MissionBankID: "mb1"}
	_ = repo.Create(context.Background(), m)

	e := echo.New()
	body := `{}`
	req := httptest.NewRequest(http.MethodPost, "/api/participant-missions/"+m.ID+"/toggle", strings.NewReader(body))
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/participant-missions/:id/toggle")
	c.SetPathValues(echo.PathValues{{Name: "id", Value: m.ID}})

	if err := h.Toggle(c); err != nil {
		t.Fatalf("Toggle err: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var env struct {
		Data entity.ParticipantMission `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if !env.Data.IsCompleted {
		t.Fatalf("expected IsCompleted true after toggle")
	}
	_ = appmiddleware.GetUserID
	_ = repository.ParticipantMissionFilter{}
}
