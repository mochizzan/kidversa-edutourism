package auth_test

import (
	"context"
	"errors"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/usecase"
)

// ---------------------------------------------------------------------------
// Session-lifecycle audit tests (#3, #12, #13b, #18, #19).
//
// lifecycleRepo is a stateful SessionRepository fake whose Transaction takes a
// snapshot of session + stage state and restores it when fn fails — the
// observable contract of a DB rollback — so CancelSession's atomicity can be
// asserted without a database. GetSessionByIDForUpdate counts the locked
// re-reads so tests can prove the lock path is used.
// ---------------------------------------------------------------------------

var errStageUpdate = errors.New("stage update failed")

type lifecycleRepo struct {
	repository.SessionRepository

	session      *entity.Session
	stages       []entity.SessionStage
	groups       []entity.SessionGroup
	lockedReads  int
	txRan        bool
	txRolledBack bool
	updated      *entity.Session
	stageCalls   int
	stageErrOn   int // 1-based UpdateSessionStage call to fail on (0 = never)
	clearCalls   int // ClearParticipantTokens invocations inside the cancel tx
	clearErr     error
}

func newLifecycleRepo(status entity.SessionStatus, stages ...entity.SessionStage) *lifecycleRepo {
	return &lifecycleRepo{
		session: &entity.Session{
			BaseModel: entity.BaseModel{ID: "sess-1"},
			ProgramID: "program-1",
			Status:    status,
		},
		stages: stages,
	}
}

func (r *lifecycleRepo) GetSessionByID(_ context.Context, id, _ string) (*entity.Session, error) {
	if r.session == nil || r.session.ID != id {
		return nil, apperrors.NotFound("not_found", nil)
	}
	cp := *r.session
	return &cp, nil
}

// GetSessionByIDForUpdate mirrors the production lock read (same data, counted)
// so tests can assert CancelSession re-read the session under the row lock.
func (r *lifecycleRepo) GetSessionByIDForUpdate(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	r.lockedReads++
	return r.GetSessionByID(ctx, id, tenantID)
}

func (r *lifecycleRepo) UpdateSession(_ context.Context, s *entity.Session) error {
	cp := *s
	r.updated = &cp
	r.session.Status = s.Status
	return nil
}

func (r *lifecycleRepo) ListSessionStages(_ context.Context, _ string) ([]entity.SessionStage, error) {
	out := make([]entity.SessionStage, len(r.stages))
	copy(out, r.stages)
	return out, nil
}

func (r *lifecycleRepo) UpdateSessionStage(_ context.Context, s *entity.SessionStage) error {
	r.stageCalls++
	if r.stageErrOn != 0 && r.stageCalls == r.stageErrOn {
		return apperrors.Internal("internal_error", errStageUpdate)
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

func (r *lifecycleRepo) ListSessionGroups(_ context.Context, _ string) ([]entity.SessionGroup, error) {
	return r.groups, nil
}

func (r *lifecycleRepo) CountActiveGroupMembers(context.Context, string, string) (int, error) {
	return 0, nil
}

func (r *lifecycleRepo) ClearParticipantTokens(_ context.Context, _, _ string) error {
	r.clearCalls++
	return r.clearErr
}

// Transaction snapshots session + stage state before fn and restores it when
// fn fails — the rollback contract of the real wrapper (audit #12).
func (r *lifecycleRepo) Transaction(_ context.Context, fn func(tx repository.SessionRepository) error) error {
	r.txRan = true
	snapSession := *r.session
	snapStages := make([]entity.SessionStage, len(r.stages))
	copy(snapStages, r.stages)
	if err := fn(r); err != nil {
		r.session = &snapSession
		r.stages = snapStages
		r.txRolledBack = true
		return err
	}
	return nil
}

// (a) CancelSession succeeds atomically: session CANCELLED, every
// non-terminal stage (ACTIVE and WAITING) stamped CANCELLED (not COMPLETED —
// audit #18), no completed_at, everything through one transaction under the
// row lock (#12/#14).
func TestCancelSession_CommitsStatusAndCancelledStagesAtomically(t *testing.T) {
	repo := newLifecycleRepo(entity.SessionActive,
		entity.SessionStage{BaseModel: entity.BaseModel{ID: "st-active"}, SessionID: "sess-1", Status: entity.SessionStageActive},
		entity.SessionStage{BaseModel: entity.BaseModel{ID: "st-waiting"}, SessionID: "sess-1", Status: entity.SessionStageWaiting},
		entity.SessionStage{BaseModel: entity.BaseModel{ID: "st-completed"}, SessionID: "sess-1", Status: entity.SessionStageCompleted},
	)
	uc := usecase.NewSessionUsecase(repo, nil)

	s, err := uc.CancelSession(context.Background(), "sess-1", "tenant-1")
	if err != nil {
		t.Fatalf("CancelSession failed: %v", err)
	}
	if s.Status != entity.SessionCancelled {
		t.Errorf("session status = %q, want CANCELLED", s.Status)
	}
	if s.AlreadyCancelled {
		t.Error("a fresh cancel must not carry the already_cancelled marker")
	}
	if !repo.txRan {
		t.Error("CancelSession must run inside one repository transaction (audit #12)")
	}
	if repo.lockedReads == 0 {
		t.Error("CancelSession must re-read the session under SELECT ... FOR UPDATE (audit #14)")
	}
	if repo.stages[0].Status != entity.SessionStageCancelled {
		t.Errorf("ACTIVE stage status = %q, want CANCELLED (audit #18)", repo.stages[0].Status)
	}
	if repo.stages[0].CompletedAt != nil {
		t.Error("a cancelled stage must not carry completed_at (audit #18)")
	}
	// WAITING is non-terminal too: cancelling stamps it CANCELLED so no live
	// stage survives on a cancelled session (Tahap 3 step 13).
	if repo.stages[1].Status != entity.SessionStageCancelled {
		t.Errorf("WAITING stage status = %q, want CANCELLED", repo.stages[1].Status)
	}
	if repo.stages[1].CompletedAt != nil {
		t.Error("a cancelled WAITING stage must not carry completed_at")
	}
	// Terminal COMPLETED stages are never rewritten.
	if repo.stages[2].Status != entity.SessionStageCompleted {
		t.Errorf("COMPLETED stage status = %q, want it untouched", repo.stages[2].Status)
	}
}

// (a2) Re-cancel (CANCELLED -> CANCELLED) is an idempotent success: HTTP 200
// with the already_cancelled marker, no error, and leftover non-terminal
// stages still converge to CANCELLED.
func TestCancelSession_ReCancel_IsIdempotentMarked(t *testing.T) {
	repo := newLifecycleRepo(entity.SessionCancelled,
		entity.SessionStage{BaseModel: entity.BaseModel{ID: "st-active"}, SessionID: "sess-1", Status: entity.SessionStageActive},
		entity.SessionStage{BaseModel: entity.BaseModel{ID: "st-done"}, SessionID: "sess-1", Status: entity.SessionStageCompleted},
	)
	uc := usecase.NewSessionUsecase(repo, nil)

	s, err := uc.CancelSession(context.Background(), "sess-1", "tenant-1")
	if err != nil {
		t.Fatalf("re-cancel must succeed idempotently, got: %v", err)
	}
	if s.Status != entity.SessionCancelled {
		t.Errorf("session status = %q, want CANCELLED", s.Status)
	}
	if !s.AlreadyCancelled {
		t.Error("re-cancel must carry the already_cancelled marker (AlreadyCancelled=true)")
	}
	if repo.stages[0].Status != entity.SessionStageCancelled {
		t.Errorf("leftover ACTIVE stage status = %q, want CANCELLED (re-cancel converges)", repo.stages[0].Status)
	}
	if repo.stages[1].Status != entity.SessionStageCompleted {
		t.Errorf("COMPLETED stage status = %q, want it untouched", repo.stages[1].Status)
	}
}

// (b) A failure part-way through the stage cascade rolls EVERYTHING back: the
// session status must not change (no half-cancelled session — audit #12).
func TestCancelSession_MidStageFailureRollsBackStatus(t *testing.T) {
	repo := newLifecycleRepo(entity.SessionActive,
		entity.SessionStage{BaseModel: entity.BaseModel{ID: "st-1"}, SessionID: "sess-1", Status: entity.SessionStageActive},
		entity.SessionStage{BaseModel: entity.BaseModel{ID: "st-2"}, SessionID: "sess-1", Status: entity.SessionStageActive},
	)
	repo.stageErrOn = 2 // first stage stamps fine, second fails mid-cascade
	uc := usecase.NewSessionUsecase(repo, nil)

	if _, err := uc.CancelSession(context.Background(), "sess-1", "tenant-1"); err == nil {
		t.Fatal("CancelSession must surface the mid-cascade failure")
	}
	if !repo.txRolledBack {
		t.Fatal("the transaction must have rolled back")
	}
	if repo.session.Status != entity.SessionActive {
		t.Errorf("session status = %q after rollback, want ACTIVE unchanged", repo.session.Status)
	}
	for i, st := range repo.stages {
		if st.Status != entity.SessionStageActive {
			t.Errorf("stage %d status = %q after rollback, want ACTIVE unchanged", i, st.Status)
		}
	}
}

// TestCancelSession_RevokesConsentTokensAtomically: cancel clears outstanding
// parent-consent tokens inside the same transaction (step 14) — a cancelled
// session never accepts consent writes, so live tokens would be dead links.
func TestCancelSession_RevokesConsentTokensAtomically(t *testing.T) {
	repo := newLifecycleRepo(entity.SessionActive,
		entity.SessionStage{BaseModel: entity.BaseModel{ID: "st-1"}, SessionID: "sess-1", Status: entity.SessionStageActive},
	)
	uc := usecase.NewSessionUsecase(repo, nil)

	if _, err := uc.CancelSession(context.Background(), "sess-1", "tenant-1"); err != nil {
		t.Fatalf("CancelSession failed: %v", err)
	}
	if repo.clearCalls != 1 {
		t.Errorf("ClearParticipantTokens calls = %d, want 1 inside the cancel tx", repo.clearCalls)
	}
}

// TestCancelSession_TokenClearFailureRollsBack: a token-revoke failure aborts
// the whole cancel — no half-cancelled session with live tokens.
func TestCancelSession_TokenClearFailureRollsBack(t *testing.T) {
	repo := newLifecycleRepo(entity.SessionActive,
		entity.SessionStage{BaseModel: entity.BaseModel{ID: "st-1"}, SessionID: "sess-1", Status: entity.SessionStageActive},
	)
	repo.clearErr = errStageUpdate
	uc := usecase.NewSessionUsecase(repo, nil)

	if _, err := uc.CancelSession(context.Background(), "sess-1", "tenant-1"); err == nil {
		t.Fatal("CancelSession must surface the token-clear failure")
	}
	if !repo.txRolledBack {
		t.Fatal("the transaction must have rolled back")
	}
	if repo.session.Status != entity.SessionActive {
		t.Errorf("session status = %q after rollback, want ACTIVE unchanged", repo.session.Status)
	}
}

// (d) StartSession rejects a CANCELLED session permanently (#19) and rejects a
// session whose program is gone (#3) before any other gate or write.
func TestStartSession_RejectsCancelledSession(t *testing.T) {
	repo := newLifecycleRepo(entity.SessionCancelled)
	uc := usecase.NewSessionUsecase(repo, nil)
	uc.SetProgramReader(&fakeProgramReader{programs: map[string]bool{"program-1": true}})

	_, err := uc.StartSession(context.Background(), "sess-1", "tenant-1")
	requireAppErrorCode(t, err, "session_cancelled_permanent")
	if repo.updated != nil || repo.txRan {
		t.Error("a rejected start must not write anything")
	}
	if repo.session.Status != entity.SessionCancelled {
		t.Errorf("session status = %q, want CANCELLED unchanged", repo.session.Status)
	}
}

func TestStartSession_MissingProgramRejected(t *testing.T) {
	repo := newLifecycleRepo(entity.SessionDraft)
	uc := usecase.NewSessionUsecase(repo, nil)
	// Program reader without "program-1": hard- or soft-deleted reads alike.
	uc.SetProgramReader(&fakeProgramReader{programs: map[string]bool{}})

	_, err := uc.StartSession(context.Background(), "sess-1", "tenant-1")
	requireAppErrorCode(t, err, "program_not_found")
	if repo.updated != nil {
		t.Error("a rejected start must not write anything")
	}

	// Control: with the program present the program gate passes and the next
	// gate decides (no groups seeded here → no_groups), proving ordering.
	okRepo := newLifecycleRepo(entity.SessionDraft)
	okUC := usecase.NewSessionUsecase(okRepo, nil)
	okUC.SetProgramReader(&fakeProgramReader{programs: map[string]bool{"program-1": true}})
	_, err = okUC.StartSession(context.Background(), "sess-1", "tenant-1")
	requireAppErrorCode(t, err, "no_groups")
}

// (d, complete variant) CompleteSession verifies the program exists before any
// grading gate or write (#3).
func TestCompleteSession_MissingProgramRejected(t *testing.T) {
	repo := newLifecycleRepo(entity.SessionActive)
	uc := usecase.NewSessionUsecase(repo, nil)
	uc.SetProgramReader(&fakeProgramReader{programs: map[string]bool{}})

	_, err := uc.CompleteSession(context.Background(), "sess-1", "tenant-1")
	requireAppErrorCode(t, err, "program_not_found")
	if repo.updated != nil || repo.session.Status != entity.SessionActive {
		t.Error("a rejected completion must leave the session untouched")
	}
}

// (f) UpdateParticipant refuses a participant whose session is closed
// (#13b): session-scoped profile writes only land on DRAFT/ACTIVE sessions.
func TestUpdateParticipant_RejectsClosedSession(t *testing.T) {
	repo := newFlowRepo()
	repo.session.Status = entity.SessionCancelled
	sid := "sess-1"
	repo.participant = &entity.Participant{BaseModel: entity.BaseModel{ID: "pid-1"}, SessionID: &sid}
	uc := usecase.NewSessionUsecase(repo, nil)

	_, err := uc.UpdateParticipant(context.Background(), "pid-1", "Nama Baru", 0, "", "", "", "", "", false, false)
	requireAppErrorCode(t, err, "session_not_editable")
	if repo.updated != nil {
		t.Error("a rejected update must not write the participant")
	}
}

// Control for (f): an ACTIVE session still accepts the profile write, so the
// gate only closes the session, not the endpoint.
func TestUpdateParticipant_AllowsEditableSession(t *testing.T) {
	repo := newFlowRepo() // sess-1 is ACTIVE
	sid := "sess-1"
	repo.participant = &entity.Participant{BaseModel: entity.BaseModel{ID: "pid-1"}, SessionID: &sid}
	uc := usecase.NewSessionUsecase(repo, nil)

	p, err := uc.UpdateParticipant(context.Background(), "pid-1", "Nama Baru", 0, "", "", "", "", "", false, false)
	if err != nil {
		t.Fatalf("update on an ACTIVE session must succeed: %v", err)
	}
	if p.ChildName != "Nama Baru" {
		t.Errorf("child name = %q, want %q", p.ChildName, "Nama Baru")
	}
	if repo.updated == nil || repo.updated.ChildName != "Nama Baru" {
		t.Error("the update must reach the repository")
	}
}
