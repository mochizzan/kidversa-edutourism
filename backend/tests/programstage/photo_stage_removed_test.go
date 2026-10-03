package programstage_test

import (
	"context"
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

// createStageRepo records the entity that ProgramHandler.CreateStage hands to
// the repository. Every other ProgramRepository method is promoted from the
// shared fake in badge_persist_test.go and panics, so an unexpected call fails
// loudly instead of being silently absorbed.
type createStageRepo struct {
	fakeProgramRepo
	created *entity.ProgramStage
}

func (r *createStageRepo) CreateStage(_ context.Context, s *entity.ProgramStage) error {
	cp := *s
	r.created = &cp
	return nil
}

// assertNoPhotoStageKey fails when the given JSON document still carries the
// removed `is_photo_stage` key. The companion check that the document does
// carry its real neighbours proves we are looking at a genuine serialization,
// not at an empty or truncated payload.
func assertNoPhotoStageKey(t *testing.T, what, raw string) {
	t.Helper()
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &fields); err != nil {
		t.Fatalf("%s: not a JSON object: %v (raw: %s)", what, err, raw)
	}
	if v, ok := fields["is_photo_stage"]; ok {
		t.Errorf("%s: still contains removed field is_photo_stage = %s", what, v)
	}
	for _, key := range []string{"name", "content_type"} {
		if _, ok := fields[key]; !ok {
			t.Errorf("%s: expected real field %q missing — payload looks wrong: %s", what, key, raw)
		}
	}
}

// TestProgramStageEntityJSONOmitsPhotoStage pins the wire contract of the
// entity: marshalling a fully populated ProgramStage (including its badge
// fields) must no longer emit is_photo_stage, while its neighbours survive.
func TestProgramStageEntityJSONOmitsPhotoStage(t *testing.T) {
	raw, err := json.Marshal(loadedStage())
	if err != nil {
		t.Fatalf("marshal ProgramStage: %v", err)
	}
	assertNoPhotoStageKey(t, "entity JSON", string(raw))

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatalf("unmarshal ProgramStage JSON: %v", err)
	}
	if _, ok := fields["badge_name"]; !ok {
		t.Errorf("badge_name missing from entity JSON — badge work must stay untouched: %s", raw)
	}
}

// TestCreateStageResponseOmitsPhotoStage: a client that still sends the
// legacy key must not get it back in the 201 payload, and the entity handed to
// the repository must not carry it either (the field is gone from the DTO ->
// entity plumbing, not merely renamed).
func TestCreateStageResponseOmitsPhotoStage(t *testing.T) {
	repo := &createStageRepo{}
	h := handler.NewProgramHandler(repo, nil, nil)
	e := echo.New()
	e.Validator = appmiddleware.NewValidator() // same validator the router installs
	body := `{"sequence_order":1,"name":"Topik Baru","description":"d",` +
		`"content_type":"VIDEO","is_photo_stage":true}`
	req := httptest.NewRequest(http.MethodPost, "/api/programs/"+programID+"/stages", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: programID}})

	if err := h.CreateStage(c); err != nil {
		t.Fatalf("CreateStage returned error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", rec.Code, rec.Body.String())
	}

	var env struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("response envelope not JSON: %v (body: %s)", err, rec.Body.String())
	}
	assertNoPhotoStageKey(t, "create response data", string(env.Data))

	if repo.created == nil {
		t.Fatal("CreateStage was never called on the repository")
	}
	createdJSON, err := json.Marshal(repo.created)
	if err != nil {
		t.Fatalf("marshal created entity: %v", err)
	}
	assertNoPhotoStageKey(t, "entity handed to repository", string(createdJSON))
}

// TestUpdateStageResponseOmitsPhotoStage: same contract on the PUT path, where
// the legacy key previously overwrote the stored value on every save.
func TestUpdateStageResponseOmitsPhotoStage(t *testing.T) {
	repo := &fakeProgramRepo{loaded: loadedStage()}
	body := `{"name":"Topik Baru","content_type":"VIDEO","is_photo_stage":true}`
	rec := runUpdateStage(t, repo, body)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("response envelope not JSON: %v (body: %s)", err, rec.Body.String())
	}
	assertNoPhotoStageKey(t, "update response data", string(env.Data))

	if repo.updated == nil {
		t.Fatal("UpdateStage was never called on the repository")
	}
	updatedJSON, err := json.Marshal(repo.updated)
	if err != nil {
		t.Fatalf("marshal updated entity: %v", err)
	}
	assertNoPhotoStageKey(t, "entity handed to repository", string(updatedJSON))
}
