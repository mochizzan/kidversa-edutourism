package auth_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/usecase"
)

// ---------------------------------------------------------------------------
// fakeSessionFlowRepo is a stateful SessionRepository fake covering the
// session-scoped participant write paths (create/link/import). It embeds the
// interface so unexercised methods panic on the nil embedded value, keeping
// the tests honest about which repository calls each path makes.
// ---------------------------------------------------------------------------

type fakeSessionFlowRepo struct {
	repository.SessionRepository

	session     *entity.Session
	sessionGets int
	groups      map[string]*entity.SessionGroup
	members     map[string][]entity.Participant // groupID -> existing members
	participant *entity.Participant
	nameExists  bool

	created        []*entity.Participant
	updated        *entity.Participant
	transactionRan bool
}

func (r *fakeSessionFlowRepo) GetSessionByID(_ context.Context, id, _ string) (*entity.Session, error) {
	r.sessionGets++
	if r.session == nil || r.session.ID != id {
		return nil, apperrors.NotFound("not_found", nil)
	}
	cp := *r.session
	return &cp, nil
}

func (r *fakeSessionFlowRepo) GetSessionGroupByID(_ context.Context, id, _ string) (*entity.SessionGroup, error) {
	if g, ok := r.groups[id]; ok {
		cp := *g
		return &cp, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeSessionFlowRepo) ListParticipants(_ context.Context, _, groupID, _ string) ([]entity.Participant, error) {
	return r.members[groupID], nil
}

func (r *fakeSessionFlowRepo) ParticipantNameExists(context.Context, string, string) (bool, error) {
	return r.nameExists, nil
}

func (r *fakeSessionFlowRepo) CreateParticipant(_ context.Context, p *entity.Participant) error {
	cp := *p
	r.created = append(r.created, &cp)
	return nil
}

func (r *fakeSessionFlowRepo) GetParticipantByID(_ context.Context, id, _ string) (*entity.Participant, error) {
	if r.participant == nil || r.participant.ID != id {
		return nil, apperrors.NotFound("not_found", nil)
	}
	cp := *r.participant
	return &cp, nil
}

func (r *fakeSessionFlowRepo) UpdateParticipant(_ context.Context, p *entity.Participant) error {
	cp := *p
	r.updated = &cp
	return nil
}

func (r *fakeSessionFlowRepo) FindDuplicateParticipants(context.Context, string, string, []repository.ParticipantInput) ([]repository.DuplicateParticipantInfo, error) {
	return nil, nil
}

func (r *fakeSessionFlowRepo) Transaction(_ context.Context, fn func(tx repository.SessionRepository) error) error {
	r.transactionRan = true
	return fn(r)
}

// newFlowRepo builds an ACTIVE session "sess-1" owning group "grp-1".
func newFlowRepo() *fakeSessionFlowRepo {
	return &fakeSessionFlowRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: "sess-1"}, Status: entity.SessionActive},
		groups: map[string]*entity.SessionGroup{
			"grp-1": {BaseModel: entity.BaseModel{ID: "grp-1"}, SessionID: "sess-1"},
		},
		members: map[string][]entity.Participant{},
	}
}

// fillGroup seeds exactly n members into a group.
func fillGroup(repo *fakeSessionFlowRepo, groupID string, n int) {
	ms := make([]entity.Participant, 0, n)
	for i := range n {
		ms = append(ms, entity.Participant{ChildName: fmt.Sprintf("Anak %d", i+1)})
	}
	repo.members[groupID] = ms
}

// TestCreateParticipantSessionScopedAttachesToGroup: session-scoped create
// (POST /api/participants with session_id) on an ACTIVE session persists both
// session_id and group_id on the new participant.
func TestCreateParticipantSessionScopedAttachesToGroup(t *testing.T) {
	repo := newFlowRepo()
	uc := usecase.NewSessionUsecase(repo, nil)

	p, err := uc.CreateParticipant(context.Background(), "tenant-1", "sess-1", "grp-1",
		"Budi Santoso", 8, "SD A", "Andi", "08123456789", "", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p == nil || len(repo.created) != 1 {
		t.Fatalf("expected exactly one created participant, got p=%v created=%d", p, len(repo.created))
	}
	c := repo.created[0]
	if c.SessionID == nil || *c.SessionID != "sess-1" {
		t.Fatalf("persisted session_id = %v, want sess-1", c.SessionID)
	}
	if c.GroupID == nil || *c.GroupID != "grp-1" {
		t.Fatalf("persisted group_id = %v, want grp-1", c.GroupID)
	}
}

// TestCreateParticipantStandaloneSkipsSessionGate: without session_id the
// create path must not consult session state at all (ungated), and the
// participant is persisted without a session.
func TestCreateParticipantStandaloneSkipsSessionGate(t *testing.T) {
	repo := newFlowRepo()
	repo.session.Status = entity.SessionCompleted // would fail the gate if consulted
	uc := usecase.NewSessionUsecase(repo, nil)

	p, err := uc.CreateParticipant(context.Background(), "tenant-1", "", "",
		"Budi Santoso", 8, "SD A", "Andi", "08123456789", "", false)
	if err != nil {
		t.Fatalf("standalone create must stay ungated, got: %v", err)
	}
	if p == nil || len(repo.created) != 1 {
		t.Fatal("expected standalone participant to be created")
	}
	if repo.sessionGets != 0 {
		t.Fatalf("standalone create must not load the session, got %d loads", repo.sessionGets)
	}
	if repo.created[0].SessionID != nil {
		t.Fatalf("standalone participant session_id = %v, want nil", repo.created[0].SessionID)
	}
}

// TestSessionScopedWritesRejectClosedSessions: create, link, and import into a
// COMPLETED or CANCELLED session must fail with session_not_editable and
// persist nothing (import must not even open a transaction).
func TestSessionScopedWritesRejectClosedSessions(t *testing.T) {
	for _, status := range []entity.SessionStatus{entity.SessionCompleted, entity.SessionCancelled} {
		for _, op := range []string{"create", "link", "import"} {
			t.Run(fmt.Sprintf("%s_%s", op, status), func(t *testing.T) {
				repo := newFlowRepo()
				repo.session.Status = status
				repo.participant = &entity.Participant{BaseModel: entity.BaseModel{ID: "pid-1"}}
				uc := usecase.NewSessionUsecase(repo, nil)
				ctx := context.Background()

				var err error
				switch op {
				case "create":
					_, err = uc.CreateParticipant(ctx, "tenant-1", "sess-1", "grp-1",
						"Anak Baru", 8, "SD A", "Andi", "08123456789", "", false)
				case "link":
					_, err = uc.LinkParticipant(ctx, "sess-1", "pid-1", "grp-1", "tenant-1")
				case "import":
					g := "grp-1"
					_, err = uc.ImportParticipants(ctx, "tenant-1", "sess-1", []repository.ParticipantInput{
						{ChildName: "Anak Baru", ChildAge: 8, ParentName: "Andi", ParentPhone: "08123456789", GroupID: &g},
					})
				}
				requireAppErrorCode(t, err, "session_not_editable")
				if len(repo.created) != 0 {
					t.Fatalf("participant persisted despite closed session: %d", len(repo.created))
				}
				if repo.updated != nil {
					t.Fatal("participant linked despite closed session")
				}
				if repo.transactionRan {
					t.Fatal("import opened a transaction despite closed session")
				}
			})
		}
	}
}

// TestLinkParticipantRejectsForeignGroup: a group that belongs to another
// session (or does not exist) must surface as 400 invalid_group, and the
// participant must not be re-linked.
func TestLinkParticipantRejectsForeignGroup(t *testing.T) {
	repo := newFlowRepo()
	repo.groups["grp-foreign"] = &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "grp-foreign"}, SessionID: "sess-2"}
	repo.participant = &entity.Participant{BaseModel: entity.BaseModel{ID: "pid-1"}}
	uc := usecase.NewSessionUsecase(repo, nil)
	ctx := context.Background()

	_, err := uc.LinkParticipant(ctx, "sess-1", "pid-1", "grp-foreign", "tenant-1")
	requireAppErrorCode(t, err, "invalid_group")

	_, err = uc.LinkParticipant(ctx, "sess-1", "pid-1", "grp-ghost", "tenant-1")
	requireAppErrorCode(t, err, "invalid_group")

	if repo.updated != nil {
		t.Fatal("participant must not be updated when the group is invalid")
	}
}

// TestLinkParticipantRejectsDuplicateInSameSession: a participant already
// linked to THIS session is a 409 participant_already_in_session, not a
// silent self-migration.
func TestLinkParticipantRejectsDuplicateInSameSession(t *testing.T) {
	repo := newFlowRepo()
	same := "sess-1"
	repo.participant = &entity.Participant{BaseModel: entity.BaseModel{ID: "pid-1"}, SessionID: &same}
	uc := usecase.NewSessionUsecase(repo, nil)

	_, err := uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "grp-1", "tenant-1")
	requireAppErrorCode(t, err, "participant_already_in_session")
	if repo.updated != nil {
		t.Fatal("duplicate link must not overwrite the participant")
	}
}

// TestGroupCapacityRejectsCreateAndLink: with MaxGroupParticipants members
// already in the group, both session-scoped create and link fail 409 group_full;
// one below the cap they still succeed (boundary).
func TestGroupCapacityRejectsCreateAndLink(t *testing.T) {
	t.Run("create_full", func(t *testing.T) {
		repo := newFlowRepo()
		fillGroup(repo, "grp-1", usecase.MaxGroupParticipants)
		uc := usecase.NewSessionUsecase(repo, nil)

		_, err := uc.CreateParticipant(context.Background(), "tenant-1", "sess-1", "grp-1",
			"Anak Baru", 8, "SD A", "Andi", "08123456789", "", false)
		requireAppErrorCode(t, err, "group_full")
		if len(repo.created) != 0 {
			t.Fatal("participant persisted into a full group")
		}
	})

	t.Run("create_one_below_cap_ok", func(t *testing.T) {
		repo := newFlowRepo()
		fillGroup(repo, "grp-1", usecase.MaxGroupParticipants-1)
		uc := usecase.NewSessionUsecase(repo, nil)

		if _, err := uc.CreateParticipant(context.Background(), "tenant-1", "sess-1", "grp-1",
			"Anak Baru", 8, "SD A", "Andi", "08123456789", "", false); err != nil {
			t.Fatalf("one below the cap must succeed, got: %v", err)
		}
		if len(repo.created) != 1 {
			t.Fatalf("expected one created participant, got %d", len(repo.created))
		}
	})

	t.Run("link_full", func(t *testing.T) {
		repo := newFlowRepo()
		fillGroup(repo, "grp-1", usecase.MaxGroupParticipants)
		repo.participant = &entity.Participant{BaseModel: entity.BaseModel{ID: "pid-1"}}
		uc := usecase.NewSessionUsecase(repo, nil)

		_, err := uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "grp-1", "tenant-1")
		requireAppErrorCode(t, err, "group_full")
		if repo.updated != nil {
			t.Fatal("participant linked into a full group")
		}
	})
}

// TestImportSkipsRowsBeyondGroupCapacity: bulk import must not hard-fail on a
// full group — the overflowing row is skipped with reason group_full, while a
// group one below the cap still accepts the row.
func TestImportSkipsRowsBeyondGroupCapacity(t *testing.T) {
	t.Run("full_group_row_skipped", func(t *testing.T) {
		repo := newFlowRepo()
		fillGroup(repo, "grp-1", usecase.MaxGroupParticipants)
		uc := usecase.NewSessionUsecase(repo, nil)
		g := "grp-1"

		res, err := uc.ImportParticipants(context.Background(), "tenant-1", "sess-1", []repository.ParticipantInput{
			{ChildName: "Anak Baru", ChildAge: 8, ParentName: "Andi", ParentPhone: "08123456789", GroupID: &g},
		})
		if err != nil {
			t.Fatalf("capacity overflow must be a skip, not an error: %v", err)
		}
		if len(res.Created) != 0 {
			t.Fatalf("expected no created rows, got %d", len(res.Created))
		}
		if len(res.Skipped) != 1 || res.Skipped[0].Reason != "group_full" {
			t.Fatalf("expected one group_full skip, got %+v", res.Skipped)
		}
		if len(repo.created) != 0 {
			t.Fatal("overflowing row must not be persisted")
		}
	})

	t.Run("one_below_cap_created", func(t *testing.T) {
		repo := newFlowRepo()
		fillGroup(repo, "grp-1", usecase.MaxGroupParticipants-1)
		uc := usecase.NewSessionUsecase(repo, nil)
		g := "grp-1"

		res, err := uc.ImportParticipants(context.Background(), "tenant-1", "sess-1", []repository.ParticipantInput{
			{ChildName: "Anak Baru", ChildAge: 8, ParentName: "Andi", ParentPhone: "08123456789", GroupID: &g},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Created) != 1 || len(res.Skipped) != 0 {
			t.Fatalf("expected one created row, got created=%d skipped=%d", len(res.Created), len(res.Skipped))
		}
		if res.Created[0].GroupID == nil || *res.Created[0].GroupID != "grp-1" {
			t.Fatalf("created row group_id = %v, want grp-1", res.Created[0].GroupID)
		}
	})
}

// TestImportRejectsForeignRowGroup: a row whose group belongs to another
// session must fail the import with invalid_group instead of silently
// attaching the participant to a foreign group.
func TestImportRejectsForeignRowGroup(t *testing.T) {
	repo := newFlowRepo()
	repo.groups["grp-foreign"] = &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "grp-foreign"}, SessionID: "sess-2"}
	uc := usecase.NewSessionUsecase(repo, nil)
	g := "grp-foreign"

	_, err := uc.ImportParticipants(context.Background(), "tenant-1", "sess-1", []repository.ParticipantInput{
		{ChildName: "Anak Baru", ChildAge: 8, ParentName: "Andi", ParentPhone: "08123456789", GroupID: &g},
	})
	requireAppErrorCode(t, err, "invalid_group")
	if len(repo.created) != 0 {
		t.Fatal("import must roll back nothing created on invalid group")
	}
}

// TestImportParticipantsHandlerKeepsRowGroupID is the regression for the bulk
// handler dropping group_id: a row posted to POST /api/sessions/:id/participants/import
// must reach the repository with its group (and the path session) intact.
func TestImportParticipantsHandlerKeepsRowGroupID(t *testing.T) {
	const sessionUUID = "11111111-1111-4111-8111-111111111111"
	repo := &fakeSessionFlowRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: sessionUUID}, Status: entity.SessionActive},
		groups: map[string]*entity.SessionGroup{
			"grp-1": {BaseModel: entity.BaseModel{ID: "grp-1"}, SessionID: sessionUUID},
		},
		members: map[string][]entity.Participant{},
	}
	uc := usecase.NewSessionUsecase(repo, nil)
	h := handler.NewSessionParticipantBulkHandler(uc)

	e := echo.New()
	e.Validator = appmiddleware.NewValidator()
	body := `{"rows":[{"child_name":"Budi","child_age":6,"parent_name":"Andi","parent_phone":"08123456789","group_id":"grp-1"}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/sessions/"+sessionUUID+"/participants/import", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: sessionUUID}})

	if err := h.ImportParticipants(c); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(repo.created) != 1 {
		t.Fatalf("expected one created participant, got %d", len(repo.created))
	}
	got := repo.created[0]
	if got.GroupID == nil || *got.GroupID != "grp-1" {
		t.Fatalf("imported row lost group_id: %v", got.GroupID)
	}
	if got.SessionID == nil || *got.SessionID != sessionUUID {
		t.Fatalf("imported row session_id = %v, want %s", got.SessionID, sessionUUID)
	}
}
