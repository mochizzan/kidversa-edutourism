package programstage_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	"kidversa-edutourism-backend/internal/domain/entity"
)

// listStagesRepo serves GET /api/programs/:id/stages from a preloaded slice.
// It embeds fakeProgramRepo (badge_persist_test.go) for every other
// ProgramRepository method and overrides only ListStages — the single
// repository call this endpoint makes.
type listStagesRepo struct {
	fakeProgramRepo
	stages []entity.ProgramStage
}

func (r *listStagesRepo) ListStages(context.Context, string) ([]entity.ProgramStage, error) {
	return r.stages, nil
}

// runListStages performs one GET through ProgramHandler.ListStages and returns
// the decoded per-stage key/value maps. Raw maps are used (not the entity
// type) because the badge fields carry `omitempty`: value decoding alone
// cannot prove a key was actually emitted on the wire.
func runListStages(t *testing.T, stages []entity.ProgramStage) []map[string]json.RawMessage {
	t.Helper()
	repo := &listStagesRepo{stages: stages}
	h := handler.NewProgramHandler(repo, nil)
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/programs/"+programID+"/stages", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: programID}})
	if err := h.ListStages(c); err != nil {
		t.Fatalf("ListStages returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data []map[string]json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("response is not the {data:[...]} envelope: %v; body: %s", err, rec.Body.String())
	}
	if len(env.Data) != len(stages) {
		t.Fatalf("data contains %d stages, want %d", len(env.Data), len(stages))
	}
	return env.Data
}

// TestListStages_BadgeFieldsInResponse: the distribution endpoint answers with
// the raw entity, so a stage carrying BOTH badge fields must expose both
// badge_name and badge_image_url keys in GET /api/programs/:id/stages. The
// client badge rendering (ProgramsPage/TopicsPage/TopicDetailPage) gates on
// these exact keys — a DTO/projection silently dropping them would make every
// client-side badge gate lie.
func TestListStages_BadgeFieldsInResponse(t *testing.T) {
	stage := entity.ProgramStage{
		BaseModel:     entity.BaseModel{ID: stageID},
		ProgramID:     programID,
		SequenceOrder: 1,
		Name:          "Topik Dengan Badge",
		ContentType:   entity.ContentTypeVideo,
		BadgeName:     "Penjelajah Senior",
		BadgeImageURL: "cont-badge-1",
	}
	data := runListStages(t, []entity.ProgramStage{stage})

	got := data[0]
	if v, ok := got["badge_name"]; !ok {
		t.Error("badge_name key missing from the stages response")
	} else if string(v) != `"Penjelajah Senior"` {
		t.Errorf("badge_name = %s, want %q", v, `"Penjelajah Senior"`)
	}
	if v, ok := got["badge_image_url"]; !ok {
		t.Error("badge_image_url key missing from the stages response")
	} else if string(v) != `"cont-badge-1"` {
		t.Errorf("badge_image_url = %s, want %q", v, `"cont-badge-1"`)
	}
}

// TestListStages_ImageOnlyKeepsBadgeImageKey: badge_name is empty here, so
// the `omitempty` tag legitimately drops that key — but badge_image_url must
// still ride along unchanged. An image-only stage is a HAS-BADGE stage for the
// client gates (S2/S3/S4), so the image key must not depend on the name.
func TestListStages_ImageOnlyKeepsBadgeImageKey(t *testing.T) {
	stage := entity.ProgramStage{
		BaseModel:     entity.BaseModel{ID: stageID},
		ProgramID:     programID,
		SequenceOrder: 1,
		Name:          "Topik Badge Tanpa Nama",
		ContentType:   entity.ContentTypeVideo,
		BadgeImageURL: "cont-badge-2",
	}
	data := runListStages(t, []entity.ProgramStage{stage})

	got := data[0]
	if v, ok := got["badge_name"]; ok {
		t.Errorf("badge_name = %s for an empty name, want the key absent (omitempty)", v)
	}
	if v, ok := got["badge_image_url"]; !ok {
		t.Error("badge_image_url key missing for an image-only stage")
	} else if string(v) != `"cont-badge-2"` {
		t.Errorf("badge_image_url = %s, want %q", v, `"cont-badge-2"`)
	}
}
