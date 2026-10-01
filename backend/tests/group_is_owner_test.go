package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
	"kidversa-edutourism-backend/internal/usecase/live"
)

// ---- fakes ----

// fakeOwnerSessionRepo serves the two reads ListGroups needs; other calls hit
// the embedded nil interface and panic (making accidental use obvious).
type fakeOwnerSessionRepo struct {
	repository.SessionRepository
	session *entity.Session
	groups  []entity.SessionGroup
}

func (r *fakeOwnerSessionRepo) GetSessionByID(context.Context, string, string) (*entity.Session, error) {
	return r.session, nil
}

func (r *fakeOwnerSessionRepo) ListSessionGroups(context.Context, string) ([]entity.SessionGroup, error) {
	return r.groups, nil
}

// fakeOwnerLiveRepo serves exactly what live.Snapshot reads.
type fakeOwnerLiveRepo struct {
	repository.LiveRepository
	groups []entity.SessionGroup
}

func (r *fakeOwnerLiveRepo) ListGroups(context.Context, string) ([]entity.SessionGroup, error) {
	return r.groups, nil
}

func (r *fakeOwnerLiveRepo) GetProgressBySession(context.Context, string) ([]entity.GroupStageProgress, error) {
	return nil, nil
}

func (r *fakeOwnerLiveRepo) ListTimeline(context.Context, string, int) ([]entity.TimelineEvent, error) {
	return nil, nil
}

func (r *fakeOwnerLiveRepo) GetProgressByGroup(context.Context, string) ([]entity.GroupStageProgress, error) {
	return nil, nil
}

func (r *fakeOwnerLiveRepo) ListParticipants(context.Context, string, string) ([]entity.Participant, error) {
	return nil, nil
}

// ---- helpers ----

const (
	ownerSessionID = "11111111-1111-4111-8111-111111111111"
	ownerFacID     = "22222222-2222-4222-8222-222222222222"
	otherFacID     = "33333333-3333-4333-8333-333333333333"
)

// Addressable copies — SessionGroup.FacilitatorID is *string and constants
// cannot be addressed.
var (
	ownerFacIDRef = ownerFacID
	otherFacIDRef = otherFacID
)

// twoGroups returns one group owned by ownerFacID and one owned by otherFacID.
func twoGroups() []entity.SessionGroup {
	return []entity.SessionGroup{
		{BaseModel: entity.BaseModel{ID: "44444444-4444-4444-8444-444444444444"}, SessionID: ownerSessionID, Name: "Kelompok Milik Saya", FacilitatorID: &ownerFacIDRef},
		{BaseModel: entity.BaseModel{ID: "55555555-5555-4555-8555-555555555555"}, SessionID: ownerSessionID, Name: "Kelompok Orang Lain", FacilitatorID: &otherFacIDRef},
	}
}

// isOwnerByGroupID extracts the is_owner flag per group id from the live
// endpoint envelope: {"data":{"groups":[{group:{id},is_owner}]}}.
func isOwnerByGroupID(t *testing.T, body []byte) map[string]bool {
	t.Helper()
	var resp struct {
		Data struct {
			Groups []struct {
				Group struct {
					ID string `json:"id"`
				} `json:"group"`
				IsOwner *bool `json:"is_owner"`
			} `json:"groups"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("unmarshal live groups response: %v (body: %s)", err, body)
	}
	out := map[string]bool{}
	for _, g := range resp.Data.Groups {
		if g.IsOwner == nil {
			t.Fatalf("group %s: is_owner field missing from response", g.Group.ID)
		}
		out[g.Group.ID] = *g.IsOwner
	}
	return out
}

// isOwnerByGroupIDSessions extracts is_owner from the sessions endpoint
// envelope: {"data":[{id,is_owner}]}.
func isOwnerByGroupIDSessions(t *testing.T, body []byte) map[string]bool {
	t.Helper()
	var resp struct {
		Data []struct {
			ID      string `json:"id"`
			IsOwner *bool  `json:"is_owner"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("unmarshal session groups response: %v (body: %s)", err, body)
	}
	out := map[string]bool{}
	for _, g := range resp.Data {
		if g.IsOwner == nil {
			t.Fatalf("group %s: is_owner field missing from response", g.ID)
		}
		out[g.ID] = *g.IsOwner
	}
	return out
}

const (
	ownedGroupID   = "44444444-4444-4444-8444-444444444444"
	foreignGroupID = "55555555-5555-4555-8555-555555555555"
	ownedGroupName = "Kelompok Milik Saya"
)

// ---- tests ----

// TestListGroupsIsOwner: GET /api/sessions/:id/groups must flag ownership
// caller-scoped — the owning facilitator sees true for their group and false
// for a peer's, while an elevated role sees true for everything.
func TestListGroupsIsOwner(t *testing.T) {
	repo := &fakeOwnerSessionRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: ownerSessionID}},
		groups:  twoGroups(),
	}
	uc := usecase.NewSessionUsecase(repo, nil)
	h := handler.NewSessionGroupHandler(uc, nil)

	cases := []struct {
		name   string
		role   entity.UserRole
		userID string
		want   map[string]bool
	}{
		{"owner facilitator", entity.RoleFasilitator, ownerFacID, map[string]bool{ownedGroupID: true, foreignGroupID: false}},
		{"non-owner facilitator", entity.RoleFasilitator, otherFacID, map[string]bool{ownedGroupID: false, foreignGroupID: true}},
		{"admin sees everything", entity.RoleAdmin, "admin-1", map[string]bool{ownedGroupID: true, foreignGroupID: true}},
		{"koordinator sees everything", entity.RoleKoordinator, "kor-1", map[string]bool{ownedGroupID: true, foreignGroupID: true}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/sessions/"+ownerSessionID+"/groups", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)
			c.SetPathValues(echo.PathValues{{Name: "id", Value: ownerSessionID}})
			c.Set(appmiddleware.CtxUserID, tc.userID)
			c.Set(appmiddleware.CtxRole, string(tc.role))

			if err := h.ListGroups(c); err != nil {
				t.Fatalf("handler returned error: %v", err)
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
			}
			got := isOwnerByGroupIDSessions(t, rec.Body.Bytes())
			if len(got) != len(tc.want) {
				t.Fatalf("expected %d groups, got %d (%v)", len(tc.want), len(got), got)
			}
			for id, want := range tc.want {
				if got[id] != want {
					t.Errorf("group %s: is_owner = %v, want %v (role=%s actor=%s)", id, got[id], want, tc.role, tc.userID)
				}
			}
		})
	}
}

// TestLiveGroupsIsOwner: GET /api/live/:sessionId/groups returns ALL groups
// (server never filters by owner) with an additive is_owner flag.
func TestLiveGroupsIsOwner(t *testing.T) {
	svc := live.NewService(&fakeOwnerLiveRepo{groups: twoGroups()}, nil, nil)
	h := handler.NewLiveHandler(svc, nil, 15)

	cases := []struct {
		name   string
		role   entity.UserRole
		userID string
		want   map[string]bool
	}{
		{"owner facilitator", entity.RoleFasilitator, ownerFacID, map[string]bool{ownedGroupID: true, foreignGroupID: false}},
		{"non-owner facilitator", entity.RoleFasilitator, otherFacID, map[string]bool{ownedGroupID: false, foreignGroupID: true}},
		{"admin sees everything", entity.RoleAdmin, "admin-1", map[string]bool{ownedGroupID: true, foreignGroupID: true}},
		{"super admin sees everything", entity.RoleSuperAdmin, "root-1", map[string]bool{ownedGroupID: true, foreignGroupID: true}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/live/"+ownerSessionID+"/groups", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)
			c.SetPathValues(echo.PathValues{{Name: "sessionId", Value: ownerSessionID}})
			c.Set(appmiddleware.CtxUserID, tc.userID)
			c.Set(appmiddleware.CtxRole, string(tc.role))

			if err := h.Groups(c); err != nil {
				t.Fatalf("handler returned error: %v", err)
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
			}
			got := isOwnerByGroupID(t, rec.Body.Bytes())
			if len(got) != len(tc.want) {
				t.Fatalf("expected %d groups (all groups must be listed), got %d (%v)", len(tc.want), len(got), got)
			}
			for id, want := range tc.want {
				if got[id] != want {
					t.Errorf("group %s: is_owner = %v, want %v (role=%s actor=%s)", id, got[id], want, tc.role, tc.userID)
				}
			}
		})
	}
}

// TestLiveGroupsKeepsAllFieldsAndShape: is_owner is additive — the wrapped
// {group, progress, participants} shape every existing consumer relies on must
// be byte-identical in structure, just with one extra sibling key.
func TestLiveGroupsKeepsAllFieldsAndShape(t *testing.T) {
	svc := live.NewService(&fakeOwnerLiveRepo{groups: twoGroups()}, nil, nil)
	h := handler.NewLiveHandler(svc, nil, 15)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/live/"+ownerSessionID+"/groups", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "sessionId", Value: ownerSessionID}})
	c.Set(appmiddleware.CtxUserID, ownerFacID)
	c.Set(appmiddleware.CtxRole, string(entity.RoleFasilitator))

	if err := h.Groups(c); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	var resp appresp.Envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}
	raw, err := json.Marshal(resp.Data)
	if err != nil {
		t.Fatalf("marshal data: %v", err)
	}
	var payload struct {
		Groups []map[string]json.RawMessage `json:"groups"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	if len(payload.Groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(payload.Groups))
	}
	for _, g := range payload.Groups {
		for _, key := range []string{"group", "progress", "participants", "is_owner"} {
			if _, ok := g[key]; !ok {
				t.Errorf("missing key %q in live group item: %v", key, g)
			}
		}
		if _, ok := g["facilitator_id"]; ok {
			t.Errorf("is_owner must be a sibling of group/progress/participants, not promoted to top level: %v", g)
		}
	}
}

// TestSessionGroupsUnassignedIsNotOwnedByFacilitator: an unassigned group
// (facilitator_id = nil) is owned by no facilitator but by elevated roles —
// mirrors assertFacilitatorOwnership semantics for the read side.
func TestSessionGroupsUnassignedIsNotOwnedByFacilitator(t *testing.T) {
	repo := &fakeOwnerSessionRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: ownerSessionID}},
		groups: []entity.SessionGroup{
			{BaseModel: entity.BaseModel{ID: ownedGroupID}, SessionID: ownerSessionID, Name: ownedGroupName, FacilitatorID: nil},
		},
	}
	uc := usecase.NewSessionUsecase(repo, nil)
	h := handler.NewSessionGroupHandler(uc, nil)

	run := func(role entity.UserRole, userID string) bool {
		e := echo.New()
		req := httptest.NewRequest(http.MethodGet, "/api/sessions/"+ownerSessionID+"/groups", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetPathValues(echo.PathValues{{Name: "id", Value: ownerSessionID}})
		c.Set(appmiddleware.CtxUserID, userID)
		c.Set(appmiddleware.CtxRole, string(role))
		if err := h.ListGroups(c); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		return isOwnerByGroupIDSessions(t, rec.Body.Bytes())[ownedGroupID]
	}

	if run(entity.RoleFasilitator, ownerFacID) {
		t.Error("unassigned group must not be owned by a facilitator")
	}
	if !run(entity.RoleAdmin, "admin-1") {
		t.Error("admin must own the unassigned group")
	}
}
