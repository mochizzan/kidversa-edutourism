package assessment_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/usecase/assessment"
)

type fakeAssessmentRepo struct {
	getByParticipantStage             *entity.Assessment
	getByParticipantStageErr          error
	getByParticipantStageIncluding    *entity.Assessment
	getByParticipantStageIncludingErr error
	createErr                         error
	updateErr                         error
	reviveErr                         error
	ownerID                           *string
	ownerErr                          error
	created                           *entity.Assessment
}

func (r *fakeAssessmentRepo) Create(ctx context.Context, a *entity.Assessment) error {
	r.created = a
	return r.createErr
}
func (r *fakeAssessmentRepo) GetByID(ctx context.Context, id, tenantID string) (*entity.Assessment, error) {
	return nil, nil
}
func (r *fakeAssessmentRepo) GetByParticipantStage(ctx context.Context, participantID, sessionSubstageID, tenantID string) (*entity.Assessment, error) {
	return r.getByParticipantStage, r.getByParticipantStageErr
}
func (r *fakeAssessmentRepo) GetByParticipantStageIncludingDeleted(ctx context.Context, participantID, sessionSubstageID, tenantID string) (*entity.Assessment, error) {
	return r.getByParticipantStageIncluding, r.getByParticipantStageIncludingErr
}
func (r *fakeAssessmentRepo) List(ctx context.Context, f repository.AssessmentFilter, page, limit int) (*repository.Paginated[entity.Assessment], error) {
	return nil, nil
}
func (r *fakeAssessmentRepo) Update(ctx context.Context, a *entity.Assessment) error {
	return r.updateErr
}
func (r *fakeAssessmentRepo) Revive(ctx context.Context, a *entity.Assessment) error {
	return r.reviveErr
}
func (r *fakeAssessmentRepo) GetGroupFacilitatorIDByParticipant(ctx context.Context, participantID string) (*string, error) {
	return r.ownerID, r.ownerErr
}

type fakeSessionRepo struct {
	session *entity.Session
	err     error
	// lockedSession/lockedErr override GetSessionByIDForUpdate (audit #14):
	// nil means "same as session". Setting it to a CANCELLED copy models a
	// CancelSession committing between the unlocked status gate and the write.
	lockedSession *entity.Session
	lockedErr     error
	lockedReads   int // how often the locked re-read ran
	group         *entity.SessionGroup
	groupErr      error
	// participant returned by GetParticipantByID; nil means the default fixture
	// participant-1 enrolled in session-1 (the session every existing fixture
	// scores), so the membership gate passes unless a test opts out.
	participant *entity.Participant
	// ownsNoGroup flips FacilitatorOwnsAnyGroup to false: a facilitator who
	// owns no group of the scored session (zero-value = owns one, keeping the
	// existing fixtures on the success side of the session-level gate).
	ownsNoGroup bool
}

func (r *fakeSessionRepo) CreateSession(ctx context.Context, s *entity.Session) error { return nil }
func (r *fakeSessionRepo) GetSessionByID(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	return r.session, r.err
}

// GetSessionByIDForUpdate is the locked re-read of the write phase (audit
// #14): it reports the CURRENT status, so a test can model a CancelSession
// committing between the unlocked gate (GetSessionByID) and the write by
// returning the session's later state here.
func (r *fakeSessionRepo) GetSessionByIDForUpdate(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	r.lockedReads++
	if r.lockedSession != nil {
		return r.lockedSession, r.lockedErr
	}
	return r.session, r.err
}
func (r *fakeSessionRepo) ListSessions(ctx context.Context, f repository.SessionFilter, page, limit int) (*repository.Paginated[entity.Session], error) {
	return nil, nil
}
func (r *fakeSessionRepo) UpdateSession(ctx context.Context, s *entity.Session) error { return nil }
func (r *fakeSessionRepo) DeleteSession(ctx context.Context, id string) error         { return nil }
func (r *fakeSessionRepo) CreateSessionStage(ctx context.Context, s *entity.SessionStage) error {
	return nil
}
func (r *fakeSessionRepo) ListSessionStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error) {
	return nil, nil
}
func (r *fakeSessionRepo) UpdateSessionStage(ctx context.Context, s *entity.SessionStage) error {
	return nil
}
func (r *fakeSessionRepo) CreateSessionGroup(ctx context.Context, g *entity.SessionGroup) error {
	return nil
}
func (r *fakeSessionRepo) GetSessionGroupByID(ctx context.Context, id, tenantID string) (*entity.SessionGroup, error) {
	return nil, nil
}
func (r *fakeSessionRepo) ListSessionGroups(ctx context.Context, sessionID string) ([]entity.SessionGroup, error) {
	return nil, nil
}
func (r *fakeSessionRepo) UpdateSessionGroup(ctx context.Context, g *entity.SessionGroup) error {
	return nil
}
func (r *fakeSessionRepo) DeleteSessionGroup(ctx context.Context, id string) error { return nil }
func (r *fakeSessionRepo) CreateGroupStageProgress(ctx context.Context, p *entity.GroupStageProgress) error {
	return nil
}
func (r *fakeSessionRepo) ListGroupStageProgress(ctx context.Context, sessionSubstageID string) ([]entity.GroupStageProgress, error) {
	return nil, nil
}
func (r *fakeSessionRepo) ListGroupStageProgressByGroup(ctx context.Context, groupID string) ([]entity.GroupStageProgress, error) {
	return nil, nil
}
func (r *fakeSessionRepo) CreateParticipant(ctx context.Context, p *entity.Participant) error {
	return nil
}
func (r *fakeSessionRepo) GetParticipantByID(ctx context.Context, id, tenantID string) (*entity.Participant, error) {
	if r.participant != nil {
		return r.participant, nil
	}
	// Default fixture: participant-1 enrolled in session-1.
	sid := "session-1"
	return &entity.Participant{BaseModel: entity.BaseModel{ID: id}, SessionID: &sid}, nil
}
func (r *fakeSessionRepo) GetParticipantGlobal(ctx context.Context, id, tenantID string) (*entity.Participant, error) {
	return nil, nil
}
func (r *fakeSessionRepo) ListParticipants(ctx context.Context, sessionID, groupID, tenantID string) ([]entity.Participant, error) {
	return nil, nil
}
func (r *fakeSessionRepo) ListParticipantsPaginated(ctx context.Context, tenantID, sessionID, groupID, search string, page, limit int) (*repository.Paginated[entity.Participant], error) {
	return nil, nil
}
func (r *fakeSessionRepo) RecordMembership(ctx context.Context, m *entity.ParticipantSessionMembership) error {
	return nil
}
func (r *fakeSessionRepo) ListSessionMemberships(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantSessionMembership, error) {
	return nil, nil
}
func (r *fakeSessionRepo) UpdateParticipant(ctx context.Context, p *entity.Participant) error {
	return nil
}
func (r *fakeSessionRepo) UpdateParticipantFields(ctx context.Context, id string, fields map[string]interface{}) error {
	return nil
}
func (r *fakeSessionRepo) UpdateParticipantTokenIfAvailable(ctx context.Context, participantID string, token string, expiresAt interface{}) (bool, error) {
	return false, nil
}
func (r *fakeSessionRepo) DeleteParticipant(ctx context.Context, id string) error { return nil }
func (r *fakeSessionRepo) ClearParticipantTokens(ctx context.Context, sessionID, tenantID string) error {
	return nil
}
func (r *fakeSessionRepo) FindParticipantSessionInfo(ctx context.Context, participantIDs []string, tenantID string) ([]repository.ParticipantSessionInfo, error) {
	return nil, nil
}
func (r *fakeSessionRepo) ListParticipantsForProgram(ctx context.Context, programID, tenantID string) ([]repository.ParticipantSessionInfo, error) {
	return nil, nil
}
func (r *fakeSessionRepo) FindDuplicateParticipants(ctx context.Context, programID, tenantID string, rows []repository.ParticipantInput) ([]repository.DuplicateParticipantInfo, error) {
	return nil, nil
}
func (r *fakeSessionRepo) ParticipantNameExists(ctx context.Context, tenantID, childName string) (bool, error) {
	return false, nil
}

// Transaction runs fn against the same fake (no-op rollback), the way the
// production wrapper binds fn to a tx-bound handle. Upsert's locked write
// phase (audit #14) runs entirely inside this callback, so a stub that skipped
// fn would never persist anything.
func (r *fakeSessionRepo) Transaction(ctx context.Context, fn func(tx repository.SessionRepository) error) error {
	return fn(r)
}

// CountActiveGroupMembers reports the pointer-membership count (audit #10);
// this fake tracks no rosters, so capacity checks see zero members.
func (r *fakeSessionRepo) CountActiveGroupMembers(ctx context.Context, sessionID, groupID string) (int, error) {
	return 0, nil
}
func (r *fakeSessionRepo) TenantIDForSession(ctx context.Context, sessionID string) (string, error) {
	return "", nil
}
func (r *fakeSessionRepo) GetGroupFacilitatorID(ctx context.Context, groupID string) (*string, error) {
	return nil, nil
}
func (r *fakeSessionRepo) FacilitatorOwnsAnyGroup(ctx context.Context, sessionID, facilitatorID string) (bool, error) {
	return !r.ownsNoGroup, nil
}
func (r *fakeSessionRepo) GetSessionGroupByParticipant(ctx context.Context, participantID string) (*entity.SessionGroup, error) {
	return r.group, r.groupErr
}

type fakeBadgeEvaluator struct{}

func (b *fakeBadgeEvaluator) EvaluateAfterAssessment(ctx context.Context, participantID, sessionSubstageID, tenantID string) error {
	return nil
}

func newUsecase(assessmentRepo *fakeAssessmentRepo, sessionRepo *fakeSessionRepo) *assessment.Usecase {
	return assessment.NewUsecase(assessmentRepo, sessionRepo, &fakeBadgeEvaluator{})
}

func requireAppErrorCode(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error with code %q, got nil", want)
	}
	_, code, ok := apperrors.AsAppError(err)
	if !ok {
		t.Fatalf("expected app error, got %v", err)
	}
	if code != want {
		t.Fatalf("expected error code %q, got %q", want, code)
	}
}

func TestUsecase_Upsert_SessionActive_Succeeds(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{
		getByParticipantStage: &entity.Assessment{
			BaseModel:         entity.BaseModel{ID: "assessment-1"},
			ParticipantID:     "participant-1",
			SessionID:         "session-1",
			SessionSubstageID: "substage-1",
			StarRating:        2,
		},
		ownerID: &owner,
	}
	sessionRepo := &fakeSessionRepo{session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive}}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "Good job", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
}

func TestUsecase_Upsert_SessionDraft_Fails(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionDraft}}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "session_not_active")
}

func TestUsecase_Upsert_SessionCompleted_Fails(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionCompleted}}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "session_not_active")
}

func TestUsecase_Upsert_SessionCancelled_Fails(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionCancelled}}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "session_not_active")
}

func TestUsecase_Upsert_EmptySessionID_Fails(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "",
		SessionSubstageID: "substage-1",
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "validation_error")
}

func TestUsecase_Upsert_SessionRepoError_Propagates(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{err: errors.New("db down")}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestUsecase_Upsert_Ownership_Fails(t *testing.T) {
	owner := "facilitator-2"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive}}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "", "facilitator-1", "facilitator-1", string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "not_group_owner")
}

func TestUsecase_Upsert_GroupCompleted_Fails(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive},
		group:   &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "group-1"}, Status: entity.GroupCompleted},
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "Good job", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "group_completed")
	if assessmentRepo.created != nil {
		t.Fatal("expected no assessment to be written on a COMPLETED group")
	}
}

func TestUsecase_Upsert_GroupCompleted_NonActiveSession_KeepsSessionGate(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionCompleted},
		group:   &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "group-1"}, Status: entity.GroupCompleted},
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "session_not_active")
}

func TestUsecase_Upsert_GroupNotCompleted_Succeeds(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive},
		group:   &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "group-1"}, Status: entity.GroupInProgress},
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "Good job", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if assessmentRepo.created == nil {
		t.Fatal("expected assessment to be written")
	}
}

func TestUsecase_Upsert_NoGroup_Succeeds(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive},
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "Good job", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	if err != nil {
		t.Fatalf("expected success for participant without group, got %v", err)
	}
}

// ── Strict session-ownership scoring gate (membership + session-level
// facilitator ownership, both enforced BEFORE any write) ──

// (a) An ACTIVE session where the facilitator owns NO group closes scoring:
// the session-level gate rejects even though the finer-grained
// participant-group lookup (session-blind) would have passed — that is
// exactly the gap the session-level rule fills.
func TestUsecase_Upsert_FacilitatorWithoutAnySessionGroup_Forbidden(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{
		session:     &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive},
		ownsNoGroup: true,
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "Good job", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "not_group_owner")
	if assessmentRepo.created != nil {
		t.Fatal("expected no assessment write when the facilitator owns no group of the session")
	}
}

// (b) Nobody may score a participant who is not enrolled in the session being
// scored — membership applies to ALL roles (facilitator variant).
func TestUsecase_Upsert_ParticipantOfAnotherSession_Forbidden(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	otherSession := "session-2"
	sessionRepo := &fakeSessionRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive},
		participant: &entity.Participant{
			BaseModel: entity.BaseModel{ID: "participant-1"},
			SessionID: &otherSession,
		},
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "Good job", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "participant_not_in_session")
	if assessmentRepo.created != nil {
		t.Fatal("expected no assessment write for a participant of another session")
	}
}

// (b, admin variant) The membership gate is NOT facilitator-only: ADMIN
// bypasses both ownership checks but never the enrollment check.
func TestUsecase_Upsert_ParticipantOfAnotherSession_AdminForbidden(t *testing.T) {
	assessmentRepo := &fakeAssessmentRepo{}
	otherSession := "session-2"
	sessionRepo := &fakeSessionRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive},
		participant: &entity.Participant{
			BaseModel: entity.BaseModel{ID: "participant-1"},
			SessionID: &otherSession,
		},
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "", "admin-1", "admin-1", string(entity.RoleAdmin), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "participant_not_in_session")
	if assessmentRepo.created != nil {
		t.Fatal("expected no assessment write for an admin scoring a foreign participant")
	}
}

// (c) Both gates pass: the facilitator owns the participant's group, owns a
// group of the ACTIVE session, and the participant is enrolled in it — the
// score still succeeds.
func TestUsecase_Upsert_OwningFacilitatorActiveSession_Succeeds(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{
		session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive},
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "Good job", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	if err != nil {
		t.Fatalf("expected success for the owning facilitator in the active session, got %v", err)
	}
	if assessmentRepo.created == nil {
		t.Fatal("expected assessment to be written")
	}
}

// (d) The session-state gate keeps precedence: a NON-ACTIVE session still
// rejects with session_not_active even when the facilitator also owns no
// group of it (the ownership gates sit inside the active-session check).
func TestUsecase_Upsert_NonActiveSession_KeepsSessionGateOverOwnership(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{
		session:     &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionDraft},
		ownsNoGroup: true,
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "session_not_active")
	if assessmentRepo.created != nil {
		t.Fatal("expected no assessment write on a non-active session")
	}
}

// ── TOCTOU guard (audit #14): cancel vs. score serialization ──

// (c) A CancelSession commits in the window between the UNLOCKED status gate
// and the write. The write phase re-reads the session under SELECT ... FOR
// UPDATE inside the write transaction, observes CANCELLED, and rejects the
// score with session_not_active — nothing is persisted (no silent write onto
// a cancelled session).
func TestUsecase_Upsert_CancelBetweenCheckAndWrite_Rejected(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{
		// The unlocked gate (GetSessionByID) still sees the session ACTIVE...
		session: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive},
		// ...but by the time the write phase re-reads under the row lock, a
		// concurrent CancelSession has committed CANCELLED.
		lockedSession: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionCancelled},
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "Good job", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1")
	requireAppErrorCode(t, err, "session_not_active")
	if sessionRepo.lockedReads == 0 {
		t.Fatal("the write phase must re-read the session under the row lock (audit #14)")
	}
	if assessmentRepo.created != nil {
		t.Fatal("the score must not be persisted on a session cancelled between check and write")
	}
}

// Control for (c): with the locked re-read still ACTIVE the score persists —
// the lock guards the write without changing its happy path.
func TestUsecase_Upsert_LockedReReadActive_Succeeds(t *testing.T) {
	owner := "facilitator-1"
	assessmentRepo := &fakeAssessmentRepo{ownerID: &owner}
	sessionRepo := &fakeSessionRepo{
		session:       &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive},
		lockedSession: &entity.Session{BaseModel: entity.BaseModel{ID: "session-1"}, Status: entity.SessionActive},
	}
	uc := newUsecase(assessmentRepo, sessionRepo)

	if _, err := uc.Upsert(context.Background(), repository.AssessmentFilter{
		ParticipantID:     "participant-1",
		SessionID:         "session-1",
		SessionSubstageID: "substage-1",
	}, 3, "Good job", owner, owner, string(entity.RoleFasilitator), time.Now(), "tenant-1"); err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if sessionRepo.lockedReads == 0 {
		t.Fatal("the write phase must re-read the session under the row lock (audit #14)")
	}
	if assessmentRepo.created == nil {
		t.Fatal("expected assessment to be written through the locked transaction")
	}
}
