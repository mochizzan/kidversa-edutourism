package auth_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

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
	extraSessions  map[string]*entity.Session // secondary sessions (link-migration sources)
	sessionTenants map[string]string          // sessionID -> owning tenant (unset = unscoped)
	groups         map[string]*entity.SessionGroup
	members        map[string][]entity.Participant // groupID -> existing members
	participant    *entity.Participant
	nameExists     bool

	created        []*entity.Participant
	updated        *entity.Participant
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

// CreateBadge emulates the DB uniques (one SUBTOPIK per Topik, one FINAL per
// program) so an accidental double award fails loudly as a conflict.
func (r *fakeLinkSubstageRepo) CreateBadge(_ context.Context, b *entity.ParticipantBadge) error {
	for i := range r.badges {
		ex := r.badges[i]
		if ex.ParticipantID != b.ParticipantID {
			continue
		}
		if b.BadgeType == entity.BadgeTypeSubtopik && ex.BadgeType == entity.BadgeTypeSubtopik &&
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
		if b.ParticipantID == participantID && b.BadgeType == entity.BadgeTypeSubtopik &&
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
// leaves every list result. SUBTOPIK rows are never touched.
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

// fakeLinkAttendanceRepo stores attendance rows keyed "participantID|sessionID".
type fakeLinkAttendanceRepo struct {
	repository.AttendanceRepository
	rows      map[string]*entity.ParticipantAttendance
	getErr    error
	upsertErr error
	upserts   []*entity.ParticipantAttendance
}

func (r *fakeLinkAttendanceRepo) GetByParticipantSession(_ context.Context, participantID, sessionID, _ string) (*entity.ParticipantAttendance, error) {
	if r.getErr != nil {
		return nil, r.getErr
	}
	if a, ok := r.rows[participantID+"|"+sessionID]; ok {
		cp := *a
		return &cp, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeLinkAttendanceRepo) Upsert(_ context.Context, a *entity.ParticipantAttendance) error {
	if r.upsertErr != nil {
		return r.upsertErr
	}
	cp := *a
	r.rows[a.ParticipantID+"|"+a.SessionID] = &cp
	r.upserts = append(r.upserts, &cp)
	return nil
}

// linkMigrationFixture wires a usecase for participant-migration links:
// target session "sess-1", source session "sess-src", participant pid-1 in the
// source, two source assessments (star 5 and star 0), and one attendance row.
// targetProgram/srcProgram differ to exercise the program_mismatch gate.
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
		"pid-1|sess-src": {
			ParticipantID: "pid-1", SessionID: "sess-src", IsPresent: true,
			MarkedAt: markedAt, MarkedBy: &markedBy,
		},
	}}

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

	// Attendance carried to the new session_id with identical content.
	if len(f.att.upserts) != 1 {
		t.Fatalf("expected exactly one attendance upsert, got %d", len(f.att.upserts))
	}
	carried := f.att.rows["pid-1|sess-1"]
	if carried == nil {
		t.Fatal("attendance row must exist under the new session_id")
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

// TestLinkParticipantRejectsCrossProgramMigration: sessions of DIFFERENT
// programs must fail with 400 program_mismatch before anything is copied or
// moved — no assessment read/write, no attendance write, no participant move,
// and NO badge recompute at all (a rejected link is not a migration).
func TestLinkParticipantRejectsCrossProgramMigration(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-B")
	// Seed badges so any (forbidden) badge mutation would be observable.
	stage1 := "stage-1"
	f.sub.badges = append(f.sub.badges,
		entity.ParticipantBadge{BaseModel: entity.BaseModel{ID: "b-sub-1"}, ParticipantID: "pid-1", ProgramID: "prog-A", ProgramStageID: &stage1, BadgeType: entity.BadgeTypeSubtopik, BadgeName: "Topik 1"},
		entity.ParticipantBadge{BaseModel: entity.BaseModel{ID: "b-final"}, ParticipantID: "pid-1", ProgramID: "prog-A", BadgeType: entity.BadgeTypeFinal, BadgeName: "Juara Akhir"},
	)

	_, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1")
	requireAppErrorCode(t, err, "program_mismatch")

	if f.repo.updated != nil {
		t.Fatal("cross-program link must not move the participant")
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
		t.Fatalf("cross-program rejection must not trigger badge recompute, got %d runs", f.prog.listStagesCalls)
	}
	if rows := badgesFor(f.sub, "pid-1"); len(rows) != 2 {
		t.Fatalf("cross-program link must leave badges untouched, got %d rows (%+v)", len(rows), rows)
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
// migration contract: the participant earned the stage-1 SUBTOPIK badge and
// the FINAL badge back when prog-A had a single Topik; the program has since
// grown to three. The same-program migration must REVOKE the stale FINAL
// immediately while KEEPING the already-earned SUBTOPIK badge (program-scoped
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
		entity.ParticipantBadge{BaseModel: entity.BaseModel{ID: "b-sub-1"}, ParticipantID: "pid-1", ProgramID: "prog-A", ProgramStageID: &stage1, BadgeType: entity.BadgeTypeSubtopik, BadgeName: "Topik 1"},
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
		t.Fatalf("badge rows = %d (%+v), want 1 (stale FINAL revoked, SUBTOPIK kept)", len(rows), rows)
	}
	got := rows[0]
	if got.BadgeType != entity.BadgeTypeSubtopik || got.ProgramStageID == nil || *got.ProgramStageID != "stage-1" {
		t.Fatalf("surviving badge = %+v, want the SUBTOPIK badge of stage-1", got)
	}
}

// TestLinkParticipantUnchangedProgramKeepsFinalBadge: same-program migration
// with an UNCHANGED Topik count and every Topik assessed — the reconcile must
// retain BOTH the FINAL and the SUBTOPIK badge (migration never strips a
// still-earned badge).
func TestLinkParticipantUnchangedProgramKeepsFinalBadge(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A") // prog-A: 1 Topik, unchanged
	stage1 := "stage-1"
	f.sub.badges = append(f.sub.badges,
		entity.ParticipantBadge{BaseModel: entity.BaseModel{ID: "b-sub-1"}, ParticipantID: "pid-1", ProgramID: "prog-A", ProgramStageID: &stage1, BadgeType: entity.BadgeTypeSubtopik, BadgeName: "Topik 1"},
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
		t.Fatalf("badge rows = %d (%+v), want 2 (FINAL and SUBTOPIK retained)", len(rows), rows)
	}
	var sawSub, sawFinal bool
	for i := range rows {
		switch rows[i].BadgeType {
		case entity.BadgeTypeSubtopik:
			sawSub = rows[i].ProgramStageID != nil && *rows[i].ProgramStageID == "stage-1"
		case entity.BadgeTypeFinal:
			sawFinal = rows[i].ProgramID == "prog-A"
		}
	}
	if !sawSub || !sawFinal {
		t.Fatalf("retained badges = %+v, want SUBTOPIK stage-1 AND FINAL prog-A", rows)
	}
}
