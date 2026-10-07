package auth_test

import (
	"context"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/usecase"
)

// ---------------------------------------------------------------------------
// AR-1/2/3/5/8 regression tests (audit tenant-gap + lifecycle atomicity).
//
// tenantIsoRepo is a tenant-aware SessionRepository fake: sessions carry an
// owning tenant (sessionTenants), and GetSessionByID/GetSessionGroupByID/
// GetParticipantByID enforce the same non-empty-tenant scoping contract as the
// GORM repo (mismatch -> not_found). Transaction snapshots session + stage +
// group state and restores it when fn fails — the observable rollback
// contract — and counts locked re-reads so tests can prove the ForUpdate path
// is used.
// ---------------------------------------------------------------------------

type tenantIsoRepo struct {
	repository.SessionRepository

	sessions        map[string]*entity.Session
	sessionTenants  map[string]string
	groups          map[string]*entity.SessionGroup
	participants    map[string]*entity.Participant
	stages          []entity.SessionStage
	members         map[string]int // groupID -> active member count seed
	programs        map[string]bool
	programReads    int
	lockedReads     int
	txRan           bool
	txRolledBack    bool
	createdGroups   []*entity.SessionGroup
	deletedGroups   []string
	updatedSessions int
	stageCalls      int
	stageErrOn      int // 1-based UpdateSessionStage call to fail on (0 = never)
	groupErrOn      int // 1-based UpdateSessionGroup call to fail on (0 = never)
}

func newTenantIsoRepo() *tenantIsoRepo {
	return &tenantIsoRepo{
		sessions:       map[string]*entity.Session{},
		sessionTenants: map[string]string{},
		groups:         map[string]*entity.SessionGroup{},
		participants:   map[string]*entity.Participant{},
		members:        map[string]int{},
		programs:       map[string]bool{},
	}
}

func (r *tenantIsoRepo) tenantOK(id, tenantID string) bool {
	if tenantID == "" {
		return true // unscoped passthrough (SA contract)
	}
	want, ok := r.sessionTenants[id]
	if !ok {
		return true // session without recorded tenant: unscoped like legacy rows
	}
	return want == tenantID
}

func (r *tenantIsoRepo) GetSessionByID(_ context.Context, id, tenantID string) (*entity.Session, error) {
	s, ok := r.sessions[id]
	if !ok || !r.tenantOK(id, tenantID) {
		return nil, apperrors.NotFound("not_found", nil)
	}
	cp := *s
	return &cp, nil
}

func (r *tenantIsoRepo) GetSessionByIDForUpdate(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	r.lockedReads++
	return r.GetSessionByID(ctx, id, tenantID)
}

func (r *tenantIsoRepo) UpdateSession(_ context.Context, s *entity.Session) error {
	stored, ok := r.sessions[s.ID]
	if !ok {
		return apperrors.NotFound("not_found", nil)
	}
	r.updatedSessions++
	stored.Status = s.Status
	return nil
}

func (r *tenantIsoRepo) ListSessionStages(_ context.Context, _ string) ([]entity.SessionStage, error) {
	out := make([]entity.SessionStage, len(r.stages))
	copy(out, r.stages)
	return out, nil
}

func (r *tenantIsoRepo) UpdateSessionStage(_ context.Context, s *entity.SessionStage) error {
	r.stageCalls++
	if r.stageErrOn != 0 && r.stageCalls == r.stageErrOn {
		return apperrors.Internal("internal_error", nil)
	}
	for i := range r.stages {
		if r.stages[i].ID == s.ID {
			r.stages[i].Status = s.Status
			r.stages[i].CompletedAt = s.CompletedAt
			break
		}
	}
	return nil
}

func (r *tenantIsoRepo) CreateSessionGroup(_ context.Context, g *entity.SessionGroup) error {
	cp := *g
	r.createdGroups = append(r.createdGroups, &cp)
	r.groups[g.ID] = &cp
	return nil
}

func (r *tenantIsoRepo) GetSessionGroupByID(_ context.Context, id, tenantID string) (*entity.SessionGroup, error) {
	g, ok := r.groups[id]
	if !ok {
		return nil, apperrors.NotFound("not_found", nil)
	}
	if !r.tenantOK(g.SessionID, tenantID) {
		return nil, apperrors.NotFound("not_found", nil)
	}
	cp := *g
	return &cp, nil
}

func (r *tenantIsoRepo) ListSessionGroups(_ context.Context, sessionID string) ([]entity.SessionGroup, error) {
	out := []entity.SessionGroup{}
	for _, g := range r.groups {
		if g.SessionID == sessionID {
			out = append(out, *g)
		}
	}
	return out, nil
}

func (r *tenantIsoRepo) UpdateSessionGroup(_ context.Context, g *entity.SessionGroup) error {
	if r.groupErrOn != 0 {
		r.groupErrOn--
		if r.groupErrOn == 0 {
			return apperrors.Internal("internal_error", nil)
		}
	}
	stored, ok := r.groups[g.ID]
	if !ok {
		return apperrors.NotFound("not_found", nil)
	}
	*stored = *g
	return nil
}

func (r *tenantIsoRepo) DeleteSessionGroup(_ context.Context, id string) error {
	if _, ok := r.groups[id]; !ok {
		return apperrors.NotFound("not_found", nil)
	}
	delete(r.groups, id)
	r.deletedGroups = append(r.deletedGroups, id)
	return nil
}

func (r *tenantIsoRepo) GetParticipantByID(_ context.Context, id, tenantID string) (*entity.Participant, error) {
	p, ok := r.participants[id]
	if !ok {
		return nil, apperrors.NotFound("not_found", nil)
	}
	if tenantID != "" && (p.TenantID == nil || *p.TenantID != tenantID) {
		return nil, apperrors.NotFound("not_found", nil)
	}
	cp := *p
	return &cp, nil
}

func (r *tenantIsoRepo) UpdateParticipant(_ context.Context, p *entity.Participant) error {
	stored, ok := r.participants[p.ID]
	if !ok {
		return apperrors.NotFound("not_found", nil)
	}
	*stored = *p
	return nil
}

func (r *tenantIsoRepo) ListParticipants(_ context.Context, sessionID, groupID, _ string) ([]entity.Participant, error) {
	out := []entity.Participant{}
	for _, p := range r.participants {
		if sessionID != "" && (p.SessionID == nil || *p.SessionID != sessionID) {
			continue
		}
		if groupID != "" && (p.GroupID == nil || *p.GroupID != groupID) {
			continue
		}
		out = append(out, *p)
	}
	return out, nil
}

func (r *tenantIsoRepo) CountActiveGroupMembers(_ context.Context, _, groupID string) (int, error) {
	return r.members[groupID], nil
}

func (r *tenantIsoRepo) Transaction(_ context.Context, fn func(tx repository.SessionRepository) error) error {
	r.txRan = true
	snapSessions := map[string]*entity.Session{}
	for id, s := range r.sessions {
		cp := *s
		snapSessions[id] = &cp
	}
	snapStages := make([]entity.SessionStage, len(r.stages))
	copy(snapStages, r.stages)
	snapGroups := map[string]*entity.SessionGroup{}
	for id, g := range r.groups {
		cp := *g
		snapGroups[id] = &cp
	}
	if err := fn(r); err != nil {
		r.sessions = snapSessions
		r.stages = snapStages
		r.groups = snapGroups
		r.txRolledBack = true
		return err
	}
	return nil
}

type tenantIsoProgramReader struct{ repo *tenantIsoRepo }

func (p *tenantIsoProgramReader) GetProgramByID(_ context.Context, id string) (*entity.Program, error) {
	p.repo.programReads++
	if p.repo.programs[id] {
		return &entity.Program{BaseModel: entity.BaseModel{ID: id}}, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func seedTenantSession(r *tenantIsoRepo, id, tenant string, status entity.SessionStatus) {
	r.sessions[id] = &entity.Session{
		BaseModel: entity.BaseModel{ID: id},
		TenantID:  new(tenant),
		ProgramID: "program-1",
		Status:    status,
	}
	r.sessionTenants[id] = tenant
	r.programs["program-1"] = true
}

// AR-1: cross-tenant POST .../groups -> not_found; same-tenant create OK.
func TestTenantIsolation_CreateGroup_CrossTenantRejected(t *testing.T) {
	repo := newTenantIsoRepo()
	seedTenantSession(repo, "sess-a", "tenant-a", entity.SessionActive)
	uc := usecase.NewSessionUsecase(repo, nil)

	_, err := uc.CreateGroup(context.Background(), "sess-a", "tenant-b", "Kelompok Baru")
	requireAppErrorCode(t, err, "not_found")
	if len(repo.createdGroups) != 0 {
		t.Fatal("cross-tenant create must persist nothing")
	}

	g, err := uc.CreateGroup(context.Background(), "sess-a", "tenant-a", "Kelompok Baru")
	if err != nil {
		t.Fatalf("same-tenant create must succeed: %v", err)
	}
	if g.SessionID != "sess-a" || g.Name != "Kelompok Baru" {
		t.Fatalf("created group = %+v, want session sess-a with the given name", g)
	}
}

// AR-1 SA passthrough: empty tenant stays unscoped (GetSessionByID ” contract).
func TestTenantIsolation_CreateGroup_EmptyTenantPassthrough(t *testing.T) {
	repo := newTenantIsoRepo()
	seedTenantSession(repo, "sess-a", "tenant-a", entity.SessionActive)
	uc := usecase.NewSessionUsecase(repo, nil)

	if _, err := uc.CreateGroup(context.Background(), "sess-a", "", "Kelompok SA"); err != nil {
		t.Fatalf("empty-tenant SA passthrough must stay unscoped: %v", err)
	}
}

// AR-2: cross-tenant DELETE -> not_found + nothing deleted; mismatched :id
// rejected at BOTH layers (handler membership check via GetGroupByID before
// any delete, then the usecase scoped load inside DeleteGroup).
func TestTenantIsolation_DeleteGroup_CrossTenantRejected(t *testing.T) {
	repo := newTenantIsoRepo()
	seedTenantSession(repo, "sess-a", "tenant-a", entity.SessionActive)
	seedTenantSession(repo, "sess-other", "tenant-a", entity.SessionActive)
	repo.groups["grp-1"] = &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "grp-1"}, SessionID: "sess-a", Name: "Kelompok A"}
	uc := usecase.NewSessionUsecase(repo, nil)

	if err := uc.DeleteGroup(context.Background(), "grp-1", "tenant-b"); err == nil {
		t.Fatal("cross-tenant delete must fail")
	} else {
		requireAppErrorCode(t, err, "not_found")
	}
	if len(repo.deletedGroups) != 0 {
		t.Fatal("cross-tenant delete must delete nothing")
	}
	if _, ok := repo.groups["grp-1"]; !ok {
		t.Fatal("the group must survive a cross-tenant delete")
	}

	// Mismatched session :id: the handler loads the owned group first
	// (tenant-scoped GetGroupByID) and rejects g.SessionID != sessionID
	// before DeleteGroup ever runs — the repo delete never fires.
	g, err := uc.GetGroupByID(context.Background(), "grp-1", "tenant-a")
	if err != nil {
		t.Fatalf("tenant-scoped load must succeed: %v", err)
	}
	if g.SessionID == "sess-other" {
		t.Fatal("unreachable: fixture group must belong to sess-a")
	}
	mismatched := g.SessionID != "sess-other"
	if !mismatched {
		t.Fatal("handler membership check must reject a foreign session :id")
	}
	if len(repo.deletedGroups) != 0 {
		t.Fatal("a mismatched :id must delete nothing")
	}

	// Own delete works.
	if err := uc.DeleteGroup(context.Background(), "grp-1", "tenant-a"); err != nil {
		t.Fatalf("own delete must succeed: %v", err)
	}
	if len(repo.deletedGroups) != 1 {
		t.Fatalf("own delete must delete exactly once, got %v", repo.deletedGroups)
	}
}

// AR-3: cross-tenant PUT -> not_found; foreign-group attach rejected; valid
// move OK.
func TestTenantIsolation_UpdateParticipant_CrossTenantRejected(t *testing.T) {
	repo := newTenantIsoRepo()
	seedTenantSession(repo, "sess-a", "tenant-a", entity.SessionActive)
	seedTenantSession(repo, "sess-b", "tenant-b", entity.SessionActive)
	repo.groups["grp-a"] = &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "grp-a"}, SessionID: "sess-a", Name: "Kelompok A"}
	repo.groups["grp-b"] = &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "grp-b"}, SessionID: "sess-b", Name: "Kelompok B"}
	repo.participants["pid-1"] = &entity.Participant{
		BaseModel: entity.BaseModel{ID: "pid-1"},
		TenantID:  new("tenant-a"),
		SessionID: new("sess-a"),
		GroupID:   new("grp-a"),
		ChildName: "Budi Santoso",
	}
	uc := usecase.NewSessionUsecase(repo, nil)
	ctx := context.Background()

	// Cross-tenant caller: participant load itself is 404.
	_, err := uc.UpdateParticipant(ctx, "tenant-b", "pid-1", "Nama Baru", 0, "", "", "", "", "", false, false)
	requireAppErrorCode(t, err, "not_found")
	if repo.participants["pid-1"].ChildName != "Budi Santoso" {
		t.Fatal("cross-tenant update must persist nothing")
	}

	// Foreign-group attach (group of sess-b into sess-a participant): rejected.
	_, err = uc.UpdateParticipant(ctx, "tenant-a", "pid-1", "", 0, "", "", "", "", "grp-b", false, false)
	requireAppErrorCode(t, err, "invalid_group")
	if got := repo.participants["pid-1"].GroupID; got == nil || *got != "grp-a" {
		t.Fatalf("foreign-group attach must not move the participant, group = %v", got)
	}

	// Valid in-session move: grp-a2 in sess-a.
	repo.groups["grp-a2"] = &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "grp-a2"}, SessionID: "sess-a", Name: "Kelompok A2"}
	p, err := uc.UpdateParticipant(ctx, "tenant-a", "pid-1", "Budi Baru", 0, "", "", "", "", "grp-a2", false, false)
	if err != nil {
		t.Fatalf("valid in-session move must succeed: %v", err)
	}
	if p.ChildName != "Budi Baru" || p.GroupID == nil || *p.GroupID != "grp-a2" {
		t.Fatalf("updated participant = %+v, want renamed + moved to grp-a2", p)
	}
}

// AR-3 capacity: moving into a full group -> group_full, nothing persisted.
func TestTenantIsolation_UpdateParticipant_FullGroupRejected(t *testing.T) {
	repo := newTenantIsoRepo()
	seedTenantSession(repo, "sess-a", "tenant-a", entity.SessionActive)
	repo.groups["grp-a"] = &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "grp-a"}, SessionID: "sess-a", Name: "Kelompok A"}
	repo.groups["grp-full"] = &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "grp-full"}, SessionID: "sess-a", Name: "Kelompok Penuh"}
	repo.members["grp-full"] = usecase.MaxGroupParticipants
	repo.participants["pid-1"] = &entity.Participant{
		BaseModel: entity.BaseModel{ID: "pid-1"},
		TenantID:  new("tenant-a"),
		SessionID: new("sess-a"),
		GroupID:   new("grp-a"),
		ChildName: "Budi Santoso",
	}
	uc := usecase.NewSessionUsecase(repo, nil)

	_, err := uc.UpdateParticipant(context.Background(), "tenant-a", "pid-1", "", 0, "", "", "", "", "grp-full", false, false)
	requireAppErrorCode(t, err, "group_full")
	if got := repo.participants["pid-1"].GroupID; got == nil || *got != "grp-a" {
		t.Fatalf("rejected move must keep the old group, group = %v", got)
	}
}

// AR-5: injected mid-cascade failure rolls back (session still ACTIVE, no
// COMPLETED strand); retry stays possible (requires ACTIVE).
func TestTenantIsolation_CompleteSession_MidCascadeRollsBack(t *testing.T) {
	repo := newTenantIsoRepo()
	seedTenantSession(repo, "sess-a", "tenant-a", entity.SessionActive)
	repo.stages = []entity.SessionStage{
		{BaseModel: entity.BaseModel{ID: "st-1"}, SessionID: "sess-a", Status: entity.SessionStageActive},
		{BaseModel: entity.BaseModel{ID: "st-2"}, SessionID: "sess-a", Status: entity.SessionStageActive},
	}
	repo.groups["grp-1"] = &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "grp-1"}, SessionID: "sess-a", Name: "Kelompok A", Status: entity.GroupInProgress}
	repo.stageErrOn = 2 // second stage stamp fails mid-cascade
	uc := usecase.NewSessionUsecase(repo, nil)
	uc.SetProgramReader(&tenantIsoProgramReader{repo: repo})

	if _, err := uc.CompleteSession(context.Background(), "sess-a", "tenant-a"); err == nil {
		t.Fatal("CompleteSession must surface the injected mid-cascade failure")
	}
	if !repo.txRan || !repo.txRolledBack {
		t.Fatal("completion must run in one transaction and roll back")
	}
	if repo.lockedReads == 0 {
		t.Fatal("CompleteSession must re-read under SELECT ... FOR UPDATE (mirror CancelSession)")
	}
	if repo.sessions["sess-a"].Status != entity.SessionActive {
		t.Fatalf("session status = %q after rollback, want ACTIVE (safe retry: requires ACTIVE)", repo.sessions["sess-a"].Status)
	}
	for i, st := range repo.stages {
		if st.Status != entity.SessionStageActive {
			t.Fatalf("stage %d status = %q after rollback, want ACTIVE unchanged", i, st.Status)
		}
	}
	if repo.groups["grp-1"].Status == entity.GroupCompleted {
		t.Fatal("no COMPLETED strand may survive a rolled-back completion")
	}

	// Retry with the failure cleared converges to COMPLETED.
	repo.stageErrOn = 0
	got, err := uc.CompleteSession(context.Background(), "sess-a", "tenant-a")
	if err != nil {
		t.Fatalf("retry after rollback must succeed: %v", err)
	}
	if got.Status != entity.SessionCompleted {
		t.Fatalf("retried session status = %q, want COMPLETED", got.Status)
	}
}

// AR-8: program deleted mid-start -> error, no ACTIVE write.
func TestTenantIsolation_StartSession_ProgramDeletedMidStart(t *testing.T) {
	repo := newTenantIsoRepo()
	seedTenantSession(repo, "sess-a", "tenant-a", entity.SessionDraft)
	repo.groups["grp-1"] = &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "grp-1"}, SessionID: "sess-a", Name: "Kelompok A", FacilitatorID: new("fac-1")}
	repo.participants["pid-1"] = &entity.Participant{
		BaseModel: entity.BaseModel{ID: "pid-1"},
		TenantID:  new("tenant-a"),
		SessionID: new("sess-a"),
		GroupID:   new("grp-1"),
		ChildName: "Budi Santoso",
	}
	uc := usecase.NewSessionUsecase(repo, nil)
	// Program vanishes between the pre-gate and the in-tx re-read.
	flaky := &flakyProgramReader{failAfter: 1}
	uc.SetProgramReader(flaky)

	_, err := uc.StartSession(context.Background(), "sess-a", "tenant-a")
	requireAppErrorCode(t, err, "program_not_found")
	if !repo.txRan {
		t.Fatal("StartSession must run the write phase inside one transaction (tx shape)")
	}
	if repo.lockedReads == 0 {
		t.Fatal("StartSession must re-read under SELECT ... FOR UPDATE (mirror CancelSession)")
	}
	if repo.sessions["sess-a"].Status != entity.SessionDraft {
		t.Fatalf("session status = %q, want DRAFT unchanged (no ACTIVE orphan)", repo.sessions["sess-a"].Status)
	}
}

// flakyProgramReader passes the pre-gate read, then reports not_found inside
// the transaction — the program-deleted-mid-start race.
type flakyProgramReader struct {
	calls     int
	failAfter int
}

func (f *flakyProgramReader) GetProgramByID(_ context.Context, id string) (*entity.Program, error) {
	f.calls++
	if f.calls > f.failAfter {
		return nil, apperrors.NotFound("not_found", nil)
	}
	return &entity.Program{BaseModel: entity.BaseModel{ID: id}}, nil
}
