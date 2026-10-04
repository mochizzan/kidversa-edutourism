package auth_test

import (
	"bytes"
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/usecase"
	badgeuc "kidversa-edutourism-backend/internal/usecase/badge"
)

// ---------------------------------------------------------------------------
// fakeSessionFlowRepo is a stateful SessionRepository fake covering the
// session-scoped participant write paths (create/link/import). It embeds the
// interface so unexercised methods panic on the nil embedded value, keeping
// the tests honest about which repository calls each path makes.
// ---------------------------------------------------------------------------

type fakeSessionFlowRepo struct {
	repository.SessionRepository

	session        *entity.Session
	sessionGets    int
	extraSessions  map[string]*entity.Session       // secondary sessions (link-migration sources)
	sessionTenants map[string]string                // sessionID -> owning tenant (unset = unscoped)
	stages         map[string][]entity.SessionStage // sessionID -> session stages (carryAttendance remap)
	groups         map[string]*entity.SessionGroup
	members        map[string][]entity.Participant // groupID -> existing members
	participant    *entity.Participant
	nameExists     bool
	// memberships are the participant_session_memberships history rows recorded
	// by LinkParticipant (unique per participant+session, like the DB table).
	memberships []entity.ParticipantSessionMembership

	created []*entity.Participant
	updated *entity.Participant
	// fieldUpdates records every UpdateParticipantFields (map) write in order,
	// so tests can assert WHICH columns were persisted explicitly.
	fieldUpdates   []map[string]interface{}
	transactionRan bool
}

func (r *fakeSessionFlowRepo) GetSessionByID(_ context.Context, id, tenantID string) (*entity.Session, error) {
	r.sessionGets++
	s := r.session
	if s == nil || s.ID != id {
		s = r.extraSessions[id]
	}
	if s == nil {
		return nil, apperrors.NotFound("not_found", nil)
	}
	if tenantID != "" {
		if want, ok := r.sessionTenants[id]; ok && want != tenantID {
			return nil, apperrors.NotFound("not_found", nil)
		}
	}
	cp := *s
	return &cp, nil
}

func (r *fakeSessionFlowRepo) GetSessionGroupByID(_ context.Context, id, _ string) (*entity.SessionGroup, error) {
	if g, ok := r.groups[id]; ok {
		cp := *g
		return &cp, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeSessionFlowRepo) ListSessionStages(_ context.Context, sessionID string) ([]entity.SessionStage, error) {
	return r.stages[sessionID], nil
}

// ListParticipants mirrors the production pointer ∪ membership-history read:
// the CURRENT pointer row matches, OR a recorded history row matches (the
// fake keeps one row per participant, so the dedup keeps A → B → A listing
// that participant exactly once — the pointer side wins). The members roster
// (group capacity seeds) is still returned for group-scoped reads.
func (r *fakeSessionFlowRepo) ListParticipants(_ context.Context, sessionID, groupID, _ string) ([]entity.Participant, error) {
	seen := map[string]bool{}
	out := make([]entity.Participant, 0, len(r.members[groupID])+1)
	p := r.participant
	if p != nil &&
		(sessionID == "" || (p.SessionID != nil && *p.SessionID == sessionID)) &&
		(groupID == "" || (p.GroupID != nil && *p.GroupID == groupID)) {
		out = append(out, *p)
		seen[p.ID] = true
	}
	if sessionID != "" && p != nil {
		for _, m := range r.memberships {
			if m.SessionID != sessionID || m.ParticipantID != p.ID || seen[m.ParticipantID] {
				continue
			}
			if groupID != "" && (m.GroupID == nil || *m.GroupID != groupID) {
				continue
			}
			out = append(out, *p)
			seen[m.ParticipantID] = true
		}
	}
	for _, mb := range r.members[groupID] {
		if mb.ID != "" && seen[mb.ID] {
			continue
		}
		out = append(out, mb)
	}
	return out, nil
}

// RecordMembership emulates the table's UNIQUE(participant_id, session_id)
// with insert-DO-NOTHING semantics: a repeated source record (link retry,
// A → B → A round trip) keeps the first row instead of failing the link.
func (r *fakeSessionFlowRepo) RecordMembership(_ context.Context, m *entity.ParticipantSessionMembership) error {
	for i := range r.memberships {
		if r.memberships[i].ParticipantID == m.ParticipantID && r.memberships[i].SessionID == m.SessionID {
			return nil
		}
	}
	cp := *m
	r.memberships = append(r.memberships, cp)
	return nil
}

// ListSessionMemberships returns the recorded history rows of a session.
func (r *fakeSessionFlowRepo) ListSessionMemberships(_ context.Context, sessionID, _ string) ([]entity.ParticipantSessionMembership, error) {
	out := make([]entity.ParticipantSessionMembership, 0, len(r.memberships))
	for i := range r.memberships {
		if r.memberships[i].SessionID == sessionID {
			out = append(out, r.memberships[i])
		}
	}
	return out, nil
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

// UpdateParticipantFields applies the column map to the stored participant the
// way GORM's map update does — explicitly, so false/nil persist (the struct
// Updates path of UpdateParticipant would skip zero values). Only the consent
// columns the tests exercise are mapped; the recorded maps are the assertion
// surface for "the reset really hit the DB".
func (r *fakeSessionFlowRepo) UpdateParticipantFields(_ context.Context, id string, fields map[string]interface{}) error {
	if r.participant == nil || r.participant.ID != id {
		return apperrors.NotFound("not_found", nil)
	}
	r.fieldUpdates = append(r.fieldUpdates, fields)
	for k, v := range fields {
		switch k {
		case "consent_photo":
			if b, ok := v.(bool); ok {
				r.participant.ConsentPhoto = b
			}
		case "consent_at":
			r.participant.ConsentAt, _ = v.(*time.Time)
		case "consent_combined_token":
			r.participant.ConsentCombinedToken, _ = v.(*string)
		case "consent_combined_token_expires_at":
			r.participant.ConsentCombinedTokenExpiresAt, _ = v.(*time.Time)
		}
	}
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

// hasMembership reports whether the fake recorded a history row for the pair
// in participant_session_memberships.
func hasMembership(repo *fakeSessionFlowRepo, participantID, sessionID string) bool {
	for i := range repo.memberships {
		if repo.memberships[i].ParticipantID == participantID && repo.memberships[i].SessionID == sessionID {
			return true
		}
	}
	return false
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

// ---------------------------------------------------------------------------
// LinkParticipant migration fakes (Perbaikan-2): assessment, session-substage
// and attendance fakes covering the same-program carry path. Unused interface
// methods panic through the embedded nil interface.
// ---------------------------------------------------------------------------

// fakeLinkAssessmentRepo serves source rows and records clones; List mirrors
// the production tenant_required guard so a missing TenantID fails loudly.
type fakeLinkAssessmentRepo struct {
	repository.AssessmentRepository
	rows      []entity.Assessment
	listErr   error
	createErr error
	listCalls []repository.AssessmentFilter
	created   []*entity.Assessment
}

func (r *fakeLinkAssessmentRepo) List(_ context.Context, f repository.AssessmentFilter, _, _ int) (*repository.Paginated[entity.Assessment], error) {
	r.listCalls = append(r.listCalls, f)
	if r.listErr != nil {
		return nil, r.listErr
	}
	if f.TenantID == "" {
		return nil, apperrors.BadRequest("tenant_required", nil)
	}
	var items []entity.Assessment
	for _, a := range r.rows {
		if a.ParticipantID == f.ParticipantID && a.SessionID == f.SessionID {
			items = append(items, a)
		}
	}
	return &repository.Paginated[entity.Assessment]{Items: items, Total: len(items)}, nil
}

func (r *fakeLinkAssessmentRepo) Create(_ context.Context, a *entity.Assessment) error {
	if r.createErr != nil {
		return r.createErr
	}
	cp := *a
	r.created = append(r.created, &cp)
	return nil
}

// fakeLinkSubstageRepo resolves session Kegiatan by ID and by
// (session, program Kegiatan) keys. Its badges slice is the in-memory
// participant_badges table the migration reconcile hook reads and writes.
type fakeLinkSubstageRepo struct {
	repository.SessionSubstageRepository
	byID   map[string]*entity.SessionSubstage
	byKeys map[string]*entity.SessionSubstage // "<sessionID>|<programSubstageID>"
	badges []entity.ParticipantBadge          // active (non-revoked) badge rows
}

func (r *fakeLinkSubstageRepo) GetSessionSubstage(_ context.Context, id string) (*entity.SessionSubstage, error) {
	if s, ok := r.byID[id]; ok {
		cp := *s
		return &cp, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeLinkSubstageRepo) GetSessionSubstageByKeys(_ context.Context, sessionID, programSubstageID string) (*entity.SessionSubstage, error) {
	if s, ok := r.byKeys[sessionID+"|"+programSubstageID]; ok {
		cp := *s
		return &cp, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

// CreateBadge emulates the DB uniques (one TOPIK per Topik, one FINAL per
// program) so an accidental double award fails loudly as a conflict.
func (r *fakeLinkSubstageRepo) CreateBadge(_ context.Context, b *entity.ParticipantBadge) error {
	for i := range r.badges {
		ex := r.badges[i]
		if ex.ParticipantID != b.ParticipantID {
			continue
		}
		if b.BadgeType == entity.BadgeTypeTopik && ex.BadgeType == entity.BadgeTypeTopik &&
			ex.ProgramStageID != nil && b.ProgramStageID != nil && *ex.ProgramStageID == *b.ProgramStageID {
			return apperrors.Conflict("conflict", nil)
		}
		if b.BadgeType == entity.BadgeTypeFinal && ex.BadgeType == entity.BadgeTypeFinal && ex.ProgramID == b.ProgramID {
			return apperrors.Conflict("conflict", nil)
		}
	}
	r.badges = append(r.badges, *b)
	return nil
}

func (r *fakeLinkSubstageRepo) ListBadgesByParticipantStage(_ context.Context, participantID, programStageID string) ([]entity.ParticipantBadge, error) {
	out := make([]entity.ParticipantBadge, 0, 1)
	for i := range r.badges {
		b := r.badges[i]
		if b.ParticipantID == participantID && b.BadgeType == entity.BadgeTypeTopik &&
			b.ProgramStageID != nil && *b.ProgramStageID == programStageID {
			out = append(out, b)
		}
	}
	return out, nil
}

func (r *fakeLinkSubstageRepo) ListFinalBadgesByParticipant(_ context.Context, participantID, programID string) ([]entity.ParticipantBadge, error) {
	out := make([]entity.ParticipantBadge, 0, 1)
	for i := range r.badges {
		b := r.badges[i]
		if b.ParticipantID == participantID && b.BadgeType == entity.BadgeTypeFinal && b.ProgramID == programID {
			out = append(out, b)
		}
	}
	return out, nil
}

// RevokeFinalBadge drops the FINAL rows — soft-delete emulation: a revoked row
// leaves every list result. TOPIK rows are never touched.
func (r *fakeLinkSubstageRepo) RevokeFinalBadge(_ context.Context, participantID, programID string) error {
	kept := make([]entity.ParticipantBadge, 0, len(r.badges))
	for i := range r.badges {
		b := r.badges[i]
		if b.ParticipantID == participantID && b.ProgramID == programID && b.BadgeType == entity.BadgeTypeFinal {
			continue
		}
		kept = append(kept, b)
	}
	r.badges = kept
	return nil
}

// badgesFor returns the active badge rows of a participant (assertion helper).
func badgesFor(r *fakeLinkSubstageRepo, participantID string) []entity.ParticipantBadge {
	out := make([]entity.ParticipantBadge, 0, len(r.badges))
	for i := range r.badges {
		if r.badges[i].ParticipantID == participantID {
			out = append(out, r.badges[i])
		}
	}
	return out
}

// fakeLinkProgramRepo feeds the FINAL badge reconcile triggered by
// LinkParticipant's same-program hook (SetBadgeReconciler →
// RecomputeFinalBadge → ListStages). listStagesCalls lets tests assert the
// hook actually ran (or did NOT run, e.g. cross-program rejection).
type fakeLinkProgramRepo struct {
	repository.ProgramRepository
	program         *entity.Program
	stages          map[string][]entity.ProgramStage // programID → Topik (sequence order)
	listStagesErr   error                            // injected lookup failure
	listStagesCalls int
}

func (r *fakeLinkProgramRepo) GetProgramByID(_ context.Context, id string) (*entity.Program, error) {
	if r.program != nil && r.program.ID == id {
		return r.program, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeLinkProgramRepo) ListStages(_ context.Context, programID string) ([]entity.ProgramStage, error) {
	r.listStagesCalls++
	if r.listStagesErr != nil {
		return nil, r.listStagesErr
	}
	return append([]entity.ProgramStage(nil), r.stages[programID]...), nil
}

// fakeLinkProgramSubstageRepo only satisfies badgeuc.NewUsecase's signature —
// the reconcile path never resolves Kegiatan.
type fakeLinkProgramSubstageRepo struct {
	repository.ProgramSubstageRepository
}

// fakeLinkAttendanceRepo stores attendance rows keyed "participantID|sessionID|sessionStageID".
type fakeLinkAttendanceRepo struct {
	repository.AttendanceRepository
	rows      map[string]*entity.ParticipantAttendance
	getErr    error
	upsertErr error
	upserts   []*entity.ParticipantAttendance
}

func linkAttKey(participantID, sessionID, sessionStageID string) string {
	return participantID + "|" + sessionID + "|" + sessionStageID
}

func (r *fakeLinkAttendanceRepo) GetByParticipantSessionStage(_ context.Context, participantID, sessionID, sessionStageID, _ string) (*entity.ParticipantAttendance, error) {
	if r.getErr != nil {
		return nil, r.getErr
	}
	if a, ok := r.rows[linkAttKey(participantID, sessionID, sessionStageID)]; ok {
		cp := *a
		return &cp, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeLinkAttendanceRepo) ListBySessionStage(_ context.Context, sessionID, sessionStageID, _ string) ([]entity.ParticipantAttendance, error) {
	out := make([]entity.ParticipantAttendance, 0, len(r.rows))
	for _, a := range r.rows {
		if a.SessionID == sessionID && a.SessionStageID == sessionStageID {
			out = append(out, *a)
		}
	}
	return out, nil
}

func (r *fakeLinkAttendanceRepo) ListByParticipantSession(_ context.Context, participantID, sessionID, _ string) ([]entity.ParticipantAttendance, error) {
	if r.getErr != nil {
		return nil, r.getErr
	}
	out := make([]entity.ParticipantAttendance, 0, len(r.rows))
	for _, a := range r.rows {
		if a.ParticipantID == participantID && a.SessionID == sessionID {
			out = append(out, *a)
		}
	}
	return out, nil
}

func (r *fakeLinkAttendanceRepo) Upsert(_ context.Context, a *entity.ParticipantAttendance) error {
	if r.upsertErr != nil {
		return r.upsertErr
	}
	cp := *a
	r.rows[linkAttKey(a.ParticipantID, a.SessionID, a.SessionStageID)] = &cp
	r.upserts = append(r.upserts, &cp)
	return nil
}

// linkMigrationFixture wires a usecase for participant-migration links:
// target session "sess-1", source session "sess-src", participant pid-1 in the
// source, two source assessments (star 5 and star 0), and one attendance row.
// targetProgram/srcProgram differ to exercise the cross-program scratch path
// (same program → clone/carry, different program → link without any copy).
type linkMigrationFixture struct {
	repo *fakeSessionFlowRepo
	asmt *fakeLinkAssessmentRepo
	sub  *fakeLinkSubstageRepo
	att  *fakeLinkAttendanceRepo
	prog *fakeLinkProgramRepo
	uc   *usecase.SessionUsecase
}

func newLinkMigrationFixture(targetProgram, srcProgram string) *linkMigrationFixture {
	repo := newFlowRepo()
	repo.session.ProgramID = targetProgram
	repo.extraSessions = map[string]*entity.Session{
		"sess-src": {BaseModel: entity.BaseModel{ID: "sess-src"}, ProgramID: srcProgram, Status: entity.SessionCompleted},
	}
	src := "sess-src"
	repo.participant = &entity.Participant{BaseModel: entity.BaseModel{ID: "pid-1"}, SessionID: &src}

	asmt := &fakeLinkAssessmentRepo{rows: []entity.Assessment{
		{ParticipantID: "pid-1", SessionID: "sess-src", SessionSubstageID: "ssub-src-1", StarRating: 5, AssessedBy: "fas-1"},
		{ParticipantID: "pid-1", SessionID: "sess-src", SessionSubstageID: "ssub-src-2", StarRating: 0, AssessedBy: "fas-1"},
	}}
	sub := &fakeLinkSubstageRepo{
		byID: map[string]*entity.SessionSubstage{
			"ssub-src-1": {BaseModel: entity.BaseModel{ID: "ssub-src-1"}, SessionID: "sess-src", ProgramSubstageID: "psub-1"},
			"ssub-src-2": {BaseModel: entity.BaseModel{ID: "ssub-src-2"}, SessionID: "sess-src", ProgramSubstageID: "psub-2"},
		},
		byKeys: map[string]*entity.SessionSubstage{
			"sess-1|psub-1": {BaseModel: entity.BaseModel{ID: "ssub-tgt-1"}, SessionID: "sess-1", ProgramSubstageID: "psub-1"},
			"sess-1|psub-2": {BaseModel: entity.BaseModel{ID: "ssub-tgt-2"}, SessionID: "sess-1", ProgramSubstageID: "psub-2"},
		},
	}
	markedBy := "fas-1"
	markedAt := time.Date(2026, 1, 15, 9, 30, 0, 0, time.UTC)
	att := &fakeLinkAttendanceRepo{rows: map[string]*entity.ParticipantAttendance{
		"pid-1|sess-src|ss-src": {
			ParticipantID: "pid-1", SessionID: "sess-src", SessionStageID: "ss-src",
			IsPresent: true, MarkedAt: markedAt, MarkedBy: &markedBy,
		},
	}}
	repo.stages = map[string][]entity.SessionStage{
		"sess-src": {{BaseModel: entity.BaseModel{ID: "ss-src"}, SessionID: "sess-src", ProgramStageID: "stage-1"}},
		"sess-1":   {{BaseModel: entity.BaseModel{ID: "ss-tgt"}, SessionID: "sess-1", ProgramStageID: "stage-1"}},
	}

	uc := usecase.NewSessionUsecase(repo, nil)
	uc.SetSubstageRepos(nil, sub)
	uc.SetAssessmentRepo(asmt)
	uc.SetAttendanceRepo(att)
	// Wire the REAL badge usecase so LinkParticipant's same-program hook runs
	// the genuine reconcile (RecomputeFinalBadge) against the fakes above.
	// Baseline: the target program still has the single Topik stage-1
	// ("unchanged"); tests modeling growth override f.prog.stages.
	prog := &fakeLinkProgramRepo{
		program: &entity.Program{
			BaseModel:      entity.BaseModel{ID: targetProgram},
			Name:           "Program",
			FinalBadgeName: "Juara Akhir",
		},
		stages: map[string][]entity.ProgramStage{
			targetProgram: {{
				BaseModel:     entity.BaseModel{ID: "stage-1"},
				ProgramID:     targetProgram,
				SequenceOrder: 1,
				BadgeName:     "Topik 1",
			}},
		},
	}
	uc.SetBadgeReconciler(badgeuc.NewUsecase(sub, &fakeLinkProgramSubstageRepo{}, prog, asmt, repo, att))
	return &linkMigrationFixture{repo: repo, asmt: asmt, sub: sub, att: att, prog: prog, uc: uc}
}

// TestLinkParticipantSameProgramCarriesAllAssessmentsAndAttendance: a link
// between two sessions of the SAME program must carry EVERY source assessment
// (star = 0 included) remapped onto the TARGET session's Kegiatan IDs — which
// are distinct from the source IDs, so the unique (participant,
// session_substage) key stays free and the participant remains re-scored-able
// — plus the attendance row under the new session_id, and finally move the
// participant.
func TestLinkParticipantSameProgramCarriesAllAssessmentsAndAttendance(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")

	res, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1")
	if err != nil {
		t.Fatalf("same-program link must succeed, got: %v", err)
	}
	if f.repo.updated == nil || f.repo.updated.SessionID == nil || *f.repo.updated.SessionID != "sess-1" {
		t.Fatalf("participant must be moved to sess-1, got %+v", f.repo.updated)
	}
	if res.PreviousSessionID != "sess-src" || res.PreviousProgramID != "prog-A" {
		t.Fatalf("migration context lost: %+v", res)
	}

	// The same-program copy goes together with the history write: the source
	// membership is recorded BEFORE the move, so session sess-src keeps
	// listing pid-1 afterwards (report pages / group tabs of the old session).
	if !hasMembership(f.repo, "pid-1", "sess-src") {
		t.Fatalf("source membership must be recorded, got %+v", f.repo.memberships)
	}

	// The source assessment read must carry the caller's tenant — without it the
	// production repo rejects with tenant_required and the clone silently dies.
	if len(f.asmt.listCalls) != 1 {
		t.Fatalf("expected exactly one source assessment list, got %d", len(f.asmt.listCalls))
	}
	if f.asmt.listCalls[0].TenantID != "tenant-1" {
		t.Fatalf("assessment list tenant = %q, want tenant-1", f.asmt.listCalls[0].TenantID)
	}

	// BOTH source rows cloned, onto TARGET-session substage IDs.
	if len(f.asmt.created) != 2 {
		t.Fatalf("expected both source assessments cloned (star 5 and star 0), got %d", len(f.asmt.created))
	}
	var sawStar0, sawStar5 bool
	for _, c := range f.asmt.created {
		if c.SessionID != "sess-1" {
			t.Fatalf("clone session_id = %q, want sess-1", c.SessionID)
		}
		switch c.SessionSubstageID {
		case "ssub-tgt-1":
			sawStar5 = c.StarRating == 5
		case "ssub-tgt-2":
			sawStar0 = c.StarRating == 0
		case "ssub-src-1", "ssub-src-2":
			t.Fatalf("clone reused source substage ID %q (re-score would collide)", c.SessionSubstageID)
		default:
			t.Fatalf("clone carries unexpected substage ID %q", c.SessionSubstageID)
		}
	}
	if !sawStar0 {
		t.Fatal("star = 0 assessment must be carried to the target session")
	}
	if !sawStar5 {
		t.Fatal("star = 5 assessment must be carried with its rating")
	}

	// Attendance carried to the new session_id with identical content,
	// remapped onto the target session's session_stage (same program_stage).
	if len(f.att.upserts) != 1 {
		t.Fatalf("expected exactly one attendance upsert, got %d", len(f.att.upserts))
	}
	carried := f.att.rows["pid-1|sess-1|ss-tgt"]
	if carried == nil {
		t.Fatal("attendance row must exist under the new session_id and target stage")
	}
	if carried.SessionStageID != "ss-tgt" {
		t.Fatalf("carried session_stage_id = %q, want ss-tgt (target session's stage)", carried.SessionStageID)
	}
	if !carried.IsPresent {
		t.Fatal("attendance IsPresent must be carried")
	}
	if !carried.MarkedAt.Equal(time.Date(2026, 1, 15, 9, 30, 0, 0, time.UTC)) {
		t.Fatalf("attendance MarkedAt = %v, want the source value", carried.MarkedAt)
	}
	if carried.MarkedBy == nil || *carried.MarkedBy != "fas-1" {
		t.Fatalf("attendance MarkedBy = %v, want fas-1", carried.MarkedBy)
	}
}

// TestLinkParticipantCrossProgramScratchData: sessions of DIFFERENT programs
// now link successfully WITHOUT copying anything — the target session starts
// scratch (no assessment read/write, no attendance write, NO badge recompute,
// badges untouched), yet the link still moves the participant and records the
// source membership so the old session keeps its history.
func TestLinkParticipantCrossProgramScratchData(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-B")
	// Seed badges so any (unexpected) badge mutation would be observable.
	stage1 := "stage-1"
	f.sub.badges = append(f.sub.badges,
		entity.ParticipantBadge{BaseModel: entity.BaseModel{ID: "b-sub-1"}, ParticipantID: "pid-1", ProgramID: "prog-A", ProgramStageID: &stage1, BadgeType: entity.BadgeTypeTopik, BadgeName: "Topik 1"},
		entity.ParticipantBadge{BaseModel: entity.BaseModel{ID: "b-final"}, ParticipantID: "pid-1", ProgramID: "prog-A", BadgeType: entity.BadgeTypeFinal, BadgeName: "Juara Akhir"},
	)

	res, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1")
	if err != nil {
		t.Fatalf("cross-program link must succeed (scratch path), got: %v", err)
	}
	if f.repo.updated == nil || f.repo.updated.SessionID == nil || *f.repo.updated.SessionID != "sess-1" {
		t.Fatalf("participant must still move to sess-1, got %+v", f.repo.updated)
	}
	if res.PreviousSessionID != "sess-src" || res.PreviousProgramID != "prog-B" {
		t.Fatalf("migration context lost: %+v", res)
	}
	if len(f.asmt.listCalls) != 0 || len(f.asmt.created) != 0 {
		t.Fatalf("cross-program link must not touch assessments: list=%d created=%d",
			len(f.asmt.listCalls), len(f.asmt.created))
	}
	if len(f.att.upserts) != 0 || len(f.att.rows) != 1 {
		t.Fatalf("cross-program link must not carry attendance: upserts=%d rows=%d",
			len(f.att.upserts), len(f.att.rows))
	}
	if f.prog.listStagesCalls != 0 {
		t.Fatalf("cross-program link must not trigger badge recompute, got %d runs", f.prog.listStagesCalls)
	}
	if rows := badgesFor(f.sub, "pid-1"); len(rows) != 2 {
		t.Fatalf("cross-program link must leave badges untouched, got %d rows (%+v)", len(rows), rows)
	}
	// The scratch path still records the SOURCE membership (history write).
	if !hasMembership(f.repo, "pid-1", "sess-src") {
		t.Fatalf("source membership must be recorded, got %+v", f.repo.memberships)
	}
}

// TestLinkParticipantRetainsSourceSessionHistory: linking A → B must NOT empty
// session A — the source membership is recorded and ListParticipants still
// returns the participant for the old session (report pages / group tabs),
// while the new session sees them through the pointer.
func TestLinkParticipantRetainsSourceSessionHistory(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-B")
	ctx := context.Background()

	if _, err := f.uc.LinkParticipant(ctx, "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("cross-program link must succeed, got: %v", err)
	}
	// Model the persisted pointer move: the fake does not write through
	// UpdateParticipant (the retry tests rely on the stale pointer).
	moved := "sess-1"
	f.repo.participant.SessionID = &moved

	old, err := f.uc.GetParticipants(ctx, "sess-src", "", "tenant-1")
	if err != nil {
		t.Fatalf("listing the source session failed: %v", err)
	}
	if len(old) != 1 || old[0].ID != "pid-1" {
		t.Fatalf("source session must still list the moved participant, got %+v", old)
	}

	cur, err := f.uc.GetParticipants(ctx, "sess-1", "", "tenant-1")
	if err != nil {
		t.Fatalf("listing the target session failed: %v", err)
	}
	if len(cur) != 1 || cur[0].ID != "pid-1" {
		t.Fatalf("target session must list the participant via its pointer, got %+v", cur)
	}
}

// TestLinkParticipantRoundTripKeepsOneRowPerSession: A → B → A → B must never
// duplicate history rows (the write is idempotent against UNIQUE
// participant+session) nor list a participant twice — in the A → B → A case
// both the pointer and a history row match session A, and the dedup keeps a
// single row.
func TestLinkParticipantRoundTripKeepsOneRowPerSession(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")
	// The source session must accept the return link (fixture default is
	// COMPLETED, which rejects writes as a closed session).
	f.repo.extraSessions["sess-src"].Status = entity.SessionActive
	ctx := context.Background()

	// A → B (sess-src → sess-1)
	if _, err := f.uc.LinkParticipant(ctx, "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("first link must succeed, got: %v", err)
	}
	moved1 := "sess-1"
	f.repo.participant.SessionID = &moved1 // simulate the persisted move

	// B → A
	if _, err := f.uc.LinkParticipant(ctx, "sess-src", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("return link must succeed, got: %v", err)
	}
	moved2 := "sess-src"
	f.repo.participant.SessionID = &moved2

	// A → B again: the repeated source record for (pid-1, sess-src) must be a
	// no-op — the fake emulates the UNIQUE key with insert-DO-NOTHING.
	if _, err := f.uc.LinkParticipant(ctx, "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("repeated link must succeed, got: %v", err)
	}
	moved3 := "sess-1"
	f.repo.participant.SessionID = &moved3

	if len(f.repo.memberships) != 2 {
		t.Fatalf("expected exactly 2 unique history rows (sess-src, sess-1), got %d (%+v)",
			len(f.repo.memberships), f.repo.memberships)
	}
	for _, sid := range []string{"sess-src", "sess-1"} {
		if !hasMembership(f.repo, "pid-1", sid) {
			t.Fatalf("missing history row for %s, got %+v", sid, f.repo.memberships)
		}
	}

	// Both sessions list pid-1 EXACTLY once: pointer-only (B), and
	// pointer+history deduplicated (A).
	for _, sid := range []string{"sess-src", "sess-1"} {
		ps, err := f.uc.GetParticipants(ctx, sid, "", "tenant-1")
		if err != nil {
			t.Fatalf("listing %s failed: %v", sid, err)
		}
		if len(ps) != 1 || ps[0].ID != "pid-1" {
			t.Fatalf("%s must list pid-1 exactly once, got %+v", sid, ps)
		}
	}
}

// TestLinkParticipantMigrationFailuresPropagateAndDoNotMove: every failure in
// the carry steps (assessment list, assessment write, attendance read/write)
// surfaces as an explicit error and leaves the participant in the source
// session — error swallowing would move the participant and lose data.
func TestLinkParticipantMigrationFailuresPropagateAndDoNotMove(t *testing.T) {
	ctx := context.Background()

	t.Run("assessment_list_failure", func(t *testing.T) {
		f := newLinkMigrationFixture("prog-A", "prog-A")
		f.asmt.listErr = apperrors.Internal("internal_error", nil)

		_, err := f.uc.LinkParticipant(ctx, "sess-1", "pid-1", "", "tenant-1")
		requireAppErrorCode(t, err, "internal_error")
		if f.repo.updated != nil {
			t.Fatal("participant must stay in the source session when the assessment list fails")
		}
		if len(f.att.upserts) != 0 {
			t.Fatal("attendance must not be carried when the clone fails")
		}
	})

	t.Run("assessment_create_failure", func(t *testing.T) {
		f := newLinkMigrationFixture("prog-A", "prog-A")
		f.asmt.createErr = apperrors.Internal("internal_error", nil)

		_, err := f.uc.LinkParticipant(ctx, "sess-1", "pid-1", "", "tenant-1")
		requireAppErrorCode(t, err, "internal_error")
		if f.repo.updated != nil {
			t.Fatal("participant must stay in the source session when the assessment write fails")
		}
		if len(f.att.upserts) != 0 {
			t.Fatal("attendance must not be carried when the clone fails")
		}
	})

	t.Run("attendance_read_failure", func(t *testing.T) {
		f := newLinkMigrationFixture("prog-A", "prog-A")
		f.att.getErr = apperrors.Internal("internal_error", nil)

		_, err := f.uc.LinkParticipant(ctx, "sess-1", "pid-1", "", "tenant-1")
		requireAppErrorCode(t, err, "internal_error")
		if f.repo.updated != nil {
			t.Fatal("participant must stay in the source session when the attendance read fails")
		}
	})

	t.Run("attendance_upsert_failure", func(t *testing.T) {
		f := newLinkMigrationFixture("prog-A", "prog-A")
		f.att.upsertErr = apperrors.Internal("internal_error", nil)

		_, err := f.uc.LinkParticipant(ctx, "sess-1", "pid-1", "", "tenant-1")
		requireAppErrorCode(t, err, "internal_error")
		if f.repo.updated != nil {
			t.Fatal("participant must stay in the source session when the attendance write fails")
		}
	})

	t.Run("badge_reconcile_failure", func(t *testing.T) {
		f := newLinkMigrationFixture("prog-A", "prog-A")
		f.prog.listStagesErr = apperrors.Internal("internal_error", nil)

		_, err := f.uc.LinkParticipant(ctx, "sess-1", "pid-1", "", "tenant-1")
		requireAppErrorCode(t, err, "internal_error")
		if f.repo.updated != nil {
			t.Fatal("participant must stay in the source session when the badge reconcile fails")
		}
		// Documented ordering: clone and carry run BEFORE the reconcile (the
		// hook fires "after assessments/attendance are copied"), so those copies
		// are already in place — a retry converges because each step is
		// idempotent (clone skips duplicates, attendance upsert, recompute).
		if len(f.asmt.created) != 2 || len(f.att.upserts) != 1 {
			t.Fatalf("copies must precede the reconcile: cloned=%d attendance=%d",
				len(f.asmt.created), len(f.att.upserts))
		}
	})
}

// TestLinkParticipantRejectsForeignTenantSourceSession: a source session
// outside the caller's tenant is a plain 404 (no existence oracle) raised
// before any copy or move.
func TestLinkParticipantRejectsForeignTenantSourceSession(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")
	f.repo.sessionTenants = map[string]string{"sess-1": "tenant-1", "sess-src": "tenant-2"}

	_, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1")
	requireAppErrorCode(t, err, "not_found")

	if f.repo.updated != nil {
		t.Fatal("participant must not move when the source session is foreign-tenant")
	}
	if len(f.asmt.listCalls) != 0 || len(f.asmt.created) != 0 {
		t.Fatalf("foreign-tenant source must not be read or cloned: list=%d created=%d",
			len(f.asmt.listCalls), len(f.asmt.created))
	}
	if len(f.att.upserts) != 0 {
		t.Fatal("foreign-tenant source must not carry attendance")
	}
}

// TestLinkParticipantGrownProgramRevokesStaleFinalBadge is the Bug-4
// migration contract: the participant earned the stage-1 TOPIK badge and
// the FINAL badge back when prog-A had a single Topik; the program has since
// grown to three. The same-program migration must REVOKE the stale FINAL
// immediately while KEEPING the already-earned TOPIK badge (program-scoped
// rows always carry across sessions).
func TestLinkParticipantGrownProgramRevokesStaleFinalBadge(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")
	// prog-A now has three Topik; the participant is assessed on stage-1 only.
	f.prog.stages["prog-A"] = []entity.ProgramStage{
		{BaseModel: entity.BaseModel{ID: "stage-1"}, ProgramID: "prog-A", SequenceOrder: 1, BadgeName: "Topik 1"},
		{BaseModel: entity.BaseModel{ID: "stage-2"}, ProgramID: "prog-A", SequenceOrder: 2, BadgeName: "Topik 2"},
		{BaseModel: entity.BaseModel{ID: "stage-3"}, ProgramID: "prog-A", SequenceOrder: 3, BadgeName: "Topik 3"},
	}
	stage1 := "stage-1"
	f.sub.badges = append(f.sub.badges,
		entity.ParticipantBadge{BaseModel: entity.BaseModel{ID: "b-sub-1"}, ParticipantID: "pid-1", ProgramID: "prog-A", ProgramStageID: &stage1, BadgeType: entity.BadgeTypeTopik, BadgeName: "Topik 1"},
		entity.ParticipantBadge{BaseModel: entity.BaseModel{ID: "b-final"}, ParticipantID: "pid-1", ProgramID: "prog-A", BadgeType: entity.BadgeTypeFinal, BadgeName: "Juara Akhir"},
	)

	res, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1")
	if err != nil {
		t.Fatalf("same-program link must succeed, got: %v", err)
	}
	if f.repo.updated == nil || f.repo.updated.SessionID == nil || *f.repo.updated.SessionID != "sess-1" {
		t.Fatalf("participant must be moved to sess-1, got %+v", f.repo.updated)
	}
	if res.PreviousSessionID != "sess-src" || res.PreviousProgramID != "prog-A" {
		t.Fatalf("migration context lost: %+v", res)
	}

	if f.prog.listStagesCalls != 1 {
		t.Fatalf("badge reconcile must run exactly once during migration, got %d runs", f.prog.listStagesCalls)
	}
	rows := badgesFor(f.sub, "pid-1")
	if len(rows) != 1 {
		t.Fatalf("badge rows = %d (%+v), want 1 (stale FINAL revoked, TOPIK kept)", len(rows), rows)
	}
	got := rows[0]
	if got.BadgeType != entity.BadgeTypeTopik || got.ProgramStageID == nil || *got.ProgramStageID != "stage-1" {
		t.Fatalf("surviving badge = %+v, want the TOPIK badge of stage-1", got)
	}
}

// TestLinkParticipantUnchangedProgramKeepsFinalBadge: same-program migration
// with an UNCHANGED Topik count and every Topik assessed — the reconcile must
// retain BOTH the FINAL and the TOPIK badge (migration never strips a
// still-earned badge).
func TestLinkParticipantUnchangedProgramKeepsFinalBadge(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A") // prog-A: 1 Topik, unchanged
	stage1 := "stage-1"
	f.sub.badges = append(f.sub.badges,
		entity.ParticipantBadge{BaseModel: entity.BaseModel{ID: "b-sub-1"}, ParticipantID: "pid-1", ProgramID: "prog-A", ProgramStageID: &stage1, BadgeType: entity.BadgeTypeTopik, BadgeName: "Topik 1"},
		entity.ParticipantBadge{BaseModel: entity.BaseModel{ID: "b-final"}, ParticipantID: "pid-1", ProgramID: "prog-A", BadgeType: entity.BadgeTypeFinal, BadgeName: "Juara Akhir"},
	)

	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("same-program link must succeed, got: %v", err)
	}

	// The reconcile really ran (it did not just skip) and kept every row.
	if f.prog.listStagesCalls != 1 {
		t.Fatalf("badge reconcile must run exactly once during migration, got %d runs", f.prog.listStagesCalls)
	}
	rows := badgesFor(f.sub, "pid-1")
	if len(rows) != 2 {
		t.Fatalf("badge rows = %d (%+v), want 2 (FINAL and TOPIK retained)", len(rows), rows)
	}
	var sawSub, sawFinal bool
	for i := range rows {
		switch rows[i].BadgeType {
		case entity.BadgeTypeTopik:
			sawSub = rows[i].ProgramStageID != nil && *rows[i].ProgramStageID == "stage-1"
		case entity.BadgeTypeFinal:
			sawFinal = rows[i].ProgramID == "prog-A"
		}
	}
	if !sawSub || !sawFinal {
		t.Fatalf("retained badges = %+v, want TOPIK stage-1 AND FINAL prog-A", rows)
	}
}

// ---------------------------------------------------------------------------
// Consent migration invariant (SETIAP SESI WAJIB CONSENT ULANG): consent is
// keyed per (participant, session) in consent_logs; a LinkParticipant move must
// leave NOTHING of it behind on the moved participant, and the server upload
// gate (upload_handler.go: consent read from consent_logs, fresh per request)
// must deny the target session until a fresh parent consent arrives.
// ---------------------------------------------------------------------------

// fakeLinkConsentRepo models consent_logs' UNIQUE (participant, session,
// consent_type) key in memory. GetConsentValue is the exact session-scoped read
// the upload gate consults, so asserting through it proves what the gate sees.
// Other interface methods panic through the embedded nil interface.
type fakeLinkConsentRepo struct {
	repository.ConsentRepository
	logs map[string]entity.ConsentLog // "<pid>|<sid>|<type>" → latest row
}

func linkConsentKey(pid, sid string, ct entity.ConsentType) string {
	return pid + "|" + sid + "|" + string(ct)
}

func (f *fakeLinkConsentRepo) GetConsentValue(_ context.Context, pid, sid string, ct entity.ConsentType) (bool, error) {
	row, ok := f.logs[linkConsentKey(pid, sid, ct)]
	return ok && row.Value && row.RespondedAt != nil, nil
}

// assertConsentReset asserts every participant-level consent projection field
// carried by entity.Participant is cleared — the exact field set
// RespondCombined writes on grant (consent_handler.go).
func assertConsentReset(t *testing.T, what string, p *entity.Participant) {
	t.Helper()
	if p == nil {
		t.Fatalf("%s: participant is nil", what)
	}
	if p.ConsentPhoto {
		t.Fatalf("%s: consent_photo must be false after migration, got true", what)
	}
	if p.ConsentAt != nil {
		t.Fatalf("%s: consent_at must be nil after migration, got %v", what, *p.ConsentAt)
	}
	if p.ConsentCombinedToken != nil {
		t.Fatalf("%s: consent_combined_token must be nil after migration, got %q", what, *p.ConsentCombinedToken)
	}
	if p.ConsentCombinedTokenExpiresAt != nil {
		t.Fatalf("%s: consent_combined_token_expires_at must be nil after migration, got %v", what, *p.ConsentCombinedTokenExpiresAt)
	}
}

// TestLinkParticipantResetsConsentProjectionForTargetSession: a participant
// granted PHOTO consent in session A (log row + denormalized projection) that
// migrates to session B of the SAME program must end up with the projection
// cleared on the returned AND the persisted entity, written through the
// map-based UpdateParticipantFields (struct Updates skip zero values), with NO
// consent_logs row for session B — so every existing facilitator guard reads an
// honest consent_photo=false and the gate input for session B denies.
func TestLinkParticipantResetsConsentProjectionForTargetSession(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")
	grantedAt := time.Date(2026, 2, 1, 10, 0, 0, 0, time.UTC)
	tok := "src-session-token"
	f.repo.participant.ConsentPhoto = true
	f.repo.participant.ConsentAt = &grantedAt
	f.repo.participant.ConsentCombinedToken = &tok
	f.repo.participant.ConsentCombinedTokenExpiresAt = &grantedAt

	consent := &fakeLinkConsentRepo{logs: map[string]entity.ConsentLog{
		linkConsentKey("pid-1", "sess-src", entity.ConsentPhoto): {
			ParticipantID: "pid-1", SessionID: "sess-src", ConsentType: entity.ConsentPhoto,
			Value: true, RespondedAt: &grantedAt,
		},
	}}
	if granted, _ := consent.GetConsentValue(context.Background(), "pid-1", "sess-src", entity.ConsentPhoto); !granted {
		t.Fatal("precondition: source session must hold granted consent")
	}

	res, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1")
	if err != nil {
		t.Fatalf("same-program link must succeed, got: %v", err)
	}

	// Returned + moved entity: every consent projection field cleared.
	assertConsentReset(t, "LinkParticipantResult.Participant", &res.Participant)
	if f.repo.updated == nil {
		t.Fatal("participant must be moved")
	}
	assertConsentReset(t, "moved entity handed to UpdateParticipant", f.repo.updated)

	// Persisted through the map update: false/nil actually reach the DB (the
	// struct-based UpdateParticipant would silently skip every zero value).
	var reset map[string]interface{}
	for _, u := range f.repo.fieldUpdates {
		if _, ok := u["consent_photo"]; ok {
			reset = u
		}
	}
	if reset == nil {
		t.Fatal("consent reset must be persisted via UpdateParticipantFields (struct Updates skip false/nil)")
	}
	if v, ok := reset["consent_photo"].(bool); !ok || v {
		t.Fatalf("consent_photo must be written as false, got %v", reset["consent_photo"])
	}
	for _, k := range []string{"consent_at", "consent_combined_token", "consent_combined_token_expires_at"} {
		v, ok := reset[k]
		if !ok {
			t.Fatalf("reset map must write %s explicitly, keys: %v", k, keysOf(reset))
		}
		if v != nil {
			t.Fatalf("%s must be written as nil, got %v", k, v)
		}
	}

	// consent_logs: nothing copied to session B; the source grant survives.
	if _, ok := consent.logs[linkConsentKey("pid-1", "sess-1", entity.ConsentPhoto)]; ok {
		t.Fatal("migration must not create a consent_logs row for the target session")
	}
	if granted, _ := consent.GetConsentValue(context.Background(), "pid-1", "sess-src", entity.ConsentPhoto); !granted {
		t.Fatal("source session's grant must be untouched")
	}
	// The exact read the server upload gate performs for session B → deny.
	if granted, _ := consent.GetConsentValue(context.Background(), "pid-1", "sess-1", entity.ConsentPhoto); granted {
		t.Fatal("upload gate input for the target session must deny (no fresh consent there)")
	}
}

func keysOf(m map[string]interface{}) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// uploadNeverTouch panics the test if the upload handler touches the photo repo
// (any method call hits the nil embedded interface) — proving the consent gate
// denies BEFORE anything is written.
type uploadNeverTouch struct{ repository.PhotoRepository }

// TestUploadGateDeniesMigratedParticipantUntilFreshConsent: end-to-end at the
// consumer boundary — after LinkParticipant moves the participant (same
// program) from session A to session B, POST /api/photos/upload for session B
// answers 403 consent_required, while the source session's granted log row
// still reads true. UUID-shaped ids because the endpoint validates them.
func TestUploadGateDeniesMigratedParticipantUntilFreshConsent(t *testing.T) {
	const (
		pid     = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
		sessA   = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
		sessB   = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
		stageB  = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
		program = "prog-A"
	)
	ctx := context.Background()
	src := sessA
	repo := &fakeSessionFlowRepo{
		session: &entity.Session{
			BaseModel: entity.BaseModel{ID: sessB}, ProgramID: program, Status: entity.SessionActive,
		},
		extraSessions: map[string]*entity.Session{
			sessA: {BaseModel: entity.BaseModel{ID: sessA}, ProgramID: program, Status: entity.SessionCompleted},
		},
		stages: map[string][]entity.SessionStage{
			sessB: {{BaseModel: entity.BaseModel{ID: stageB}, SessionID: sessB, ProgramStageID: "stage-1"}},
		},
		groups:  map[string]*entity.SessionGroup{},
		members: map[string][]entity.Participant{},
		participant: &entity.Participant{
			BaseModel:    entity.BaseModel{ID: pid},
			SessionID:    &src,
			ConsentPhoto: true, // stale projection inherited from session A
		},
	}
	grantedAt := time.Date(2026, 2, 1, 10, 0, 0, 0, time.UTC)
	consent := &fakeLinkConsentRepo{logs: map[string]entity.ConsentLog{
		linkConsentKey(pid, sessA, entity.ConsentPhoto): {
			ParticipantID: pid, SessionID: sessA, ConsentType: entity.ConsentPhoto,
			Value: true, RespondedAt: &grantedAt,
		},
	}}
	if granted, _ := consent.GetConsentValue(ctx, pid, sessA, entity.ConsentPhoto); !granted {
		t.Fatal("precondition: source session must hold granted consent")
	}

	// Same-program migration (optional carry deps unwired → all copy steps skip).
	uc := usecase.NewSessionUsecase(repo, nil)
	if _, err := uc.LinkParticipant(ctx, sessB, pid, "", "tenant-1"); err != nil {
		t.Fatalf("same-program link must succeed, got: %v", err)
	}
	if _, ok := consent.logs[linkConsentKey(pid, sessB, entity.ConsentPhoto)]; ok {
		t.Fatal("migration must not carry a consent_logs row into the target session")
	}

	// The REAL upload handler over the same fakes: gate reads consent_logs.
	h := handler.NewUploadHandler(
		&config.Config{UploadDir: t.TempDir()},
		uploadNeverTouch{}, nil, nil, nil, consent, repo,
	)

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range map[string]string{
		"participant_id":   pid,
		"session_id":       sessB,
		"session_stage_id": stageB,
	} {
		if err := w.WriteField(k, v); err != nil {
			t.Fatalf("write field %s: %v", k, err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatalf("close multipart: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/photos/upload", &buf)
	req.Header.Set(echo.HeaderContentType, w.FormDataContentType())
	rec := httptest.NewRecorder()
	e := echo.New()
	c := e.NewContext(req, rec)

	if err := h.UploadPhoto(c); err != nil {
		t.Fatalf("upload for the target session must answer with the 403 envelope, got error: %v", err)
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for session B without fresh consent, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"code":"consent_required"`) {
		t.Fatalf("expected consent_required envelope, got: %s", rec.Body.String())
	}
}
