package auth_test

import (
	"context"
	"testing"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/assessment"
	"kidversa-edutourism-backend/internal/usecase/attendance"
	"kidversa-edutourism-backend/internal/usecase/live"
)

// Perbaikan-2: per-Kegiatan lock tests. A COMPLETED/SKIPPED progress row locks
// the nilai for that Kegiatan (assessment 403 substage_completed; live
// re-complete/re-skip 409 substage_completed, zero mutation; unlock stays the
// correction path). Whole-group COMPLETED still rejects with group_completed.

// --- fakes (unique names; package auth_test is shared across backend/tests) ---

type subGuardAssessmentRepo struct {
	repository.AssessmentRepository
	byStage      *entity.Assessment
	byStageErr   error
	including    *entity.Assessment
	includingErr error
	created      *entity.Assessment
	updated      *entity.Assessment
	createErr    error
	updateErr    error
}

func (r *subGuardAssessmentRepo) GetByParticipantStage(_ context.Context, _, _, _ string) (*entity.Assessment, error) {
	return r.byStage, r.byStageErr
}

func (r *subGuardAssessmentRepo) GetByParticipantStageIncludingDeleted(_ context.Context, _, _, _ string) (*entity.Assessment, error) {
	return r.including, r.includingErr
}

func (r *subGuardAssessmentRepo) Create(_ context.Context, a *entity.Assessment) error {
	r.created = a
	return r.createErr
}

func (r *subGuardAssessmentRepo) Update(_ context.Context, a *entity.Assessment) error {
	r.updated = a
	return r.updateErr
}

type subGuardSessionRepo struct {
	repository.SessionRepository
	session  *entity.Session
	sessErr  error
	group    *entity.SessionGroup
	groupErr error
	progress []entity.GroupStageProgress
	progErr  error
}

func (r *subGuardSessionRepo) GetSessionByID(_ context.Context, _, _ string) (*entity.Session, error) {
	return r.session, r.sessErr
}

func (r *subGuardSessionRepo) GetSessionGroupByParticipant(_ context.Context, _ string) (*entity.SessionGroup, error) {
	return r.group, r.groupErr
}

func (r *subGuardSessionRepo) ListGroupStageProgressByGroup(_ context.Context, _ string) ([]entity.GroupStageProgress, error) {
	return r.progress, r.progErr
}

type subGuardBadge struct{}

func (subGuardBadge) EvaluateAfterAssessment(_ context.Context, _, _, _ string) error {
	return nil
}

type subGuardLiveRepo struct {
	repository.LiveRepository
	group    *entity.SessionGroup
	progress []entity.GroupStageProgress
	upserts  int
}

func (r *subGuardLiveRepo) GetGroup(_ context.Context, _ string) (*entity.SessionGroup, error) {
	if r.group == nil {
		return nil, apperrors.NotFound("not_found", nil)
	}
	row := *r.group
	return &row, nil
}

func (r *subGuardLiveRepo) TenantIDForSession(_ context.Context, _ string) (string, error) {
	return "tenant-subguard", nil
}

func (r *subGuardLiveRepo) GetProgressByGroup(_ context.Context, _ string) ([]entity.GroupStageProgress, error) {
	out := make([]entity.GroupStageProgress, 0, len(r.progress))
	for i := range r.progress {
		if r.progress[i].GroupID == r.group.ID {
			out = append(out, r.progress[i])
		}
	}
	return out, nil
}

func (r *subGuardLiveRepo) UpsertProgress(_ context.Context, p *entity.GroupStageProgress) error {
	r.upserts++
	for i := range r.progress {
		if r.progress[i].GroupID == p.GroupID && r.progress[i].SessionSubstageID == p.SessionSubstageID {
			r.progress[i] = *p
			return nil
		}
	}
	row := *p
	r.progress = append(r.progress, row)
	return nil
}

func (r *subGuardLiveRepo) UpdateGroup(_ context.Context, g *entity.SessionGroup) error {
	row := *g
	r.group = &row
	return nil
}

type subGuardAttendanceRepo struct {
	repository.AttendanceRepository
	upserts int
}

func (r *subGuardAttendanceRepo) GetByParticipantSessionStage(_ context.Context, _, _, _, _ string) (*entity.ParticipantAttendance, error) {
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *subGuardAttendanceRepo) ListBySessionStage(_ context.Context, _, _, _ string) ([]entity.ParticipantAttendance, error) {
	return nil, nil
}

func (r *subGuardAttendanceRepo) ListByParticipantSession(_ context.Context, _, _, _ string) ([]entity.ParticipantAttendance, error) {
	return nil, nil
}

func (r *subGuardAttendanceRepo) Upsert(_ context.Context, _ *entity.ParticipantAttendance) error {
	r.upserts++
	return nil
}

// --- fixtures ---

func subGuardActiveSession() *entity.Session {
	return &entity.Session{BaseModel: entity.BaseModel{ID: "sess-subguard"}, Status: entity.SessionActive}
}

func subGuardGroup(status entity.GroupStatus) *entity.SessionGroup {
	return &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "group-subguard"}, SessionID: "sess-subguard", Status: status}
}

func subGuardAssessmentUC(arepo *subGuardAssessmentRepo, srepo *subGuardSessionRepo) *assessment.Usecase {
	return assessment.NewUsecase(arepo, srepo, subGuardBadge{})
}

func subGuardUpsertReq() repository.AssessmentFilter {
	return repository.AssessmentFilter{ParticipantID: "part-1", SessionID: "sess-subguard", SessionSubstageID: "sub-1"}
}

// NotFound among active rows drives the Create path; IncludingDeleted misses
// so no revive happens.
func subGuardMissingAssessment() (*entity.Assessment, error, *entity.Assessment, error) {
	nf := apperrors.NotFound("not_found", nil)
	return nil, nf, nil, nf
}

// --- assessment: per-substage lock ---

func TestSubstageGuard_AssessmentCompletedSubstageRejected(t *testing.T) {
	byStage, byStageErr, incl, inclErr := subGuardMissingAssessment()
	arepo := &subGuardAssessmentRepo{byStage: byStage, byStageErr: byStageErr, including: incl, includingErr: inclErr}
	srepo := &subGuardSessionRepo{
		session: subGuardActiveSession(),
		group:   subGuardGroup(entity.GroupInProgress),
		progress: []entity.GroupStageProgress{
			{GroupID: "group-subguard", SessionSubstageID: "sub-1", Status: entity.ProgressCompleted},
		},
	}
	uc := subGuardAssessmentUC(arepo, srepo)

	_, err := uc.Upsert(context.Background(), subGuardUpsertReq(), 4, "bagus", "guru-1", "admin-1", string(entity.RoleAdmin), time.Now(), "tenant-subguard")
	requireAppErrorCode(t, err, "substage_completed")
	if status, _, _ := apperrors.AsAppError(err); status != 403 {
		t.Fatalf("status = %d, want 403", status)
	}
	if arepo.created != nil || arepo.updated != nil {
		t.Fatal("locked substage must not write any assessment row")
	}
}

func TestSubstageGuard_AssessmentSkippedSubstageRejected(t *testing.T) {
	byStage, byStageErr, incl, inclErr := subGuardMissingAssessment()
	arepo := &subGuardAssessmentRepo{byStage: byStage, byStageErr: byStageErr, including: incl, includingErr: inclErr}
	srepo := &subGuardSessionRepo{
		session: subGuardActiveSession(),
		group:   subGuardGroup(entity.GroupInProgress),
		progress: []entity.GroupStageProgress{
			{GroupID: "group-subguard", SessionSubstageID: "sub-1", Status: entity.ProgressSkipped},
		},
	}
	uc := subGuardAssessmentUC(arepo, srepo)

	_, err := uc.Upsert(context.Background(), subGuardUpsertReq(), 4, "", "guru-1", "admin-1", string(entity.RoleAdmin), time.Now(), "tenant-subguard")
	requireAppErrorCode(t, err, "substage_completed")
	if arepo.created != nil || arepo.updated != nil {
		t.Fatal("skipped substage must not write any assessment row")
	}
}

func TestSubstageGuard_AssessmentOtherSubstageStillWritable(t *testing.T) {
	byStage, byStageErr, incl, inclErr := subGuardMissingAssessment()
	arepo := &subGuardAssessmentRepo{byStage: byStage, byStageErr: byStageErr, including: incl, includingErr: inclErr}
	srepo := &subGuardSessionRepo{
		session: subGuardActiveSession(),
		group:   subGuardGroup(entity.GroupInProgress),
		progress: []entity.GroupStageProgress{
			// sub-1 done, but the write targets sub-2 -> must pass the lock.
			{GroupID: "group-subguard", SessionSubstageID: "sub-1", Status: entity.ProgressCompleted},
		},
	}
	uc := subGuardAssessmentUC(arepo, srepo)

	req := subGuardUpsertReq()
	req.SessionSubstageID = "sub-2"
	if _, err := uc.Upsert(context.Background(), req, 4, "", "guru-1", "admin-1", string(entity.RoleAdmin), time.Now(), "tenant-subguard"); err != nil {
		t.Fatalf("other substage must stay writable, got %v", err)
	}
	if arepo.created == nil {
		t.Fatal("expected assessment row to be written for the unlocked substage")
	}
}

func TestSubstageGuard_AssessmentWholeGroupCompletedKeepsGroupCode(t *testing.T) {
	arepo := &subGuardAssessmentRepo{}
	srepo := &subGuardSessionRepo{
		session: subGuardActiveSession(),
		group:   subGuardGroup(entity.GroupCompleted),
		progress: []entity.GroupStageProgress{
			{GroupID: "group-subguard", SessionSubstageID: "sub-1", Status: entity.ProgressCompleted},
		},
	}
	uc := subGuardAssessmentUC(arepo, srepo)

	// Whole-group guard keeps precedence: group_completed, not substage_completed.
	_, err := uc.Upsert(context.Background(), subGuardUpsertReq(), 4, "", "guru-1", "admin-1", string(entity.RoleAdmin), time.Now(), "tenant-subguard")
	requireAppErrorCode(t, err, "group_completed")
	if arepo.created != nil || arepo.updated != nil {
		t.Fatal("completed group must not write any assessment row")
	}
}

// --- live: terminal rows reject re-complete/re-skip, unlock allowed ---

func subGuardLiveFixture(status entity.GroupStageProgressStatus) (*subGuardLiveRepo, *live.Service) {
	repo := &subGuardLiveRepo{
		group: &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "group-subguard"}, SessionID: "sess-subguard", Status: entity.GroupWaiting},
		progress: []entity.GroupStageProgress{
			{GroupID: "group-subguard", SessionSubstageID: "sub-1", Status: status},
		},
	}
	return repo, live.NewService(repo, nil, sse.NewHub(), nil)
}

func TestSubstageGuard_LiveRecompleteTerminalRejected(t *testing.T) {
	repo, svc := subGuardLiveFixture(entity.ProgressCompleted)

	p, err := svc.OverrideStage(context.Background(), "group-subguard", "sub-1", live.ActionComplete, "actor-1", string(entity.RoleAdmin), "tenant-subguard")
	requireAppErrorCode(t, err, "substage_completed")
	if status, _, _ := apperrors.AsAppError(err); status != 409 {
		t.Fatalf("status = %d, want 409", status)
	}
	if p != nil {
		t.Fatalf("rejected re-complete must return nil progress, got %+v", p)
	}
	if repo.upserts != 0 {
		t.Fatalf("upserts = %d, want 0 (zero mutation)", repo.upserts)
	}
	if repo.progress[0].Status != entity.ProgressCompleted {
		t.Fatalf("row status = %q, want COMPLETED (untouched)", repo.progress[0].Status)
	}
}

func TestSubstageGuard_LiveReskipTerminalRejected(t *testing.T) {
	repo, svc := subGuardLiveFixture(entity.ProgressSkipped)

	p, err := svc.OverrideStage(context.Background(), "group-subguard", "sub-1", live.ActionSkip, "actor-1", string(entity.RoleAdmin), "tenant-subguard")
	requireAppErrorCode(t, err, "substage_completed")
	if p != nil {
		t.Fatalf("rejected re-skip must return nil progress, got %+v", p)
	}
	if repo.upserts != 0 {
		t.Fatalf("upserts = %d, want 0 (zero mutation)", repo.upserts)
	}
}

func TestSubstageGuard_LiveUnlockTerminalAllowed(t *testing.T) {
	_, svc := subGuardLiveFixture(entity.ProgressCompleted)

	// Unlock is the correction path: a terminal row may be reopened.
	p, err := svc.OverrideStage(context.Background(), "group-subguard", "sub-1", live.ActionUnlock, "actor-1", string(entity.RoleAdmin), "tenant-subguard")
	if err != nil {
		t.Fatalf("unlock of terminal row must stay allowed, got %v", err)
	}
	if p == nil || p.Status != entity.ProgressUnlocked {
		t.Fatalf("progress status = %v, want UNLOCKED", p)
	}
}

func TestSubstageGuard_LiveCompleteNonTerminalAllowed(t *testing.T) {
	repo := &subGuardLiveRepo{
		group: &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "group-subguard"}, SessionID: "sess-subguard", Status: entity.GroupWaiting},
		progress: []entity.GroupStageProgress{
			{GroupID: "group-subguard", SessionSubstageID: "sub-1", Status: entity.ProgressUnlocked},
			{GroupID: "group-subguard", SessionSubstageID: "sub-2", Status: entity.ProgressUnlocked},
		},
	}
	svc := live.NewService(repo, nil, sse.NewHub(), nil)

	// Completing sub-1 leaves sub-2 non-terminal, so no promotion runs.
	p, err := svc.OverrideStage(context.Background(), "group-subguard", "sub-1", live.ActionComplete, "actor-1", string(entity.RoleAdmin), "tenant-subguard")
	if err != nil {
		t.Fatalf("first complete of a non-terminal row must succeed, got %v", err)
	}
	if p == nil || p.Status != entity.ProgressCompleted {
		t.Fatalf("progress status = %v, want COMPLETED", p)
	}
}

// --- attendance: whole-group lock retained (session-scoped, option A) ---

func TestSubstageGuard_AttendanceWholeGroupCompletedRejected(t *testing.T) {
	arepo := &subGuardAttendanceRepo{}
	srepo := &subGuardSessionRepo{group: subGuardGroup(entity.GroupCompleted)}
	uc := attendance.NewUsecase(arepo, srepo)

	// Group COMPLETED keeps precedence over topic validation: the stage
	// lookup is never reached, so no ListSessionStages stub is needed.
	_, err := uc.Upsert(context.Background(), "part-1", "sess-subguard", "stage-subguard", true, "guru-1", "tenant-subguard")
	requireAppErrorCode(t, err, "group_completed")
	if arepo.upserts != 0 {
		t.Fatalf("upserts = %d, want 0 (completed group locks attendance)", arepo.upserts)
	}
}

// --- response messages ---

func TestSubstageGuard_ResponseMessages(t *testing.T) {
	if got := appresp.MessageForCode("substage_completed"); got != "Penilaian kegiatan ini sudah diselesaikan; tidak dapat diubah lagi." {
		t.Fatalf("substage_completed message = %q", got)
	}
	if got := appresp.MessageForCode("topic_completed"); got == "" || got == appresp.MessageForCode("no_such_code_xyz") {
		t.Fatalf("topic_completed must resolve to its own message, got %q", got)
	}
	// group_completed string is frontend-pinned (groupCompletedErrorMessage):
	// byte-identical, never changed by this patch.
	if got := appresp.MessageForCode("group_completed"); got != "Kelompok sudah diselesaikan; kehadiran dan penilaian tidak dapat diubah lagi." {
		t.Fatalf("group_completed message changed: %q", got)
	}
}
