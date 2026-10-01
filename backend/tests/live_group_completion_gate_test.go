package auth_test

import (
	"context"
	"errors"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase/live"
)

// The fasilitator "Selesaikan Kelompok" flow completes every Kegiatan leaf via
// OverrideStage; the final leaf triggers the group promotion to COMPLETED.
// These tests pin that the promotion runs the attendance-aware grading gate
// (badge.Usecase.ValidateGroupCompletion via the GroupCompletionValidator
// interface) and can never be silently skipped.

const (
	liveGateGroupID   = "gate-group-1"
	liveGateSessionID = "gate-session-1"
	liveGateTenant    = "tenant-live-gate"
)

// fakeGateLiveRepo serves the OverrideStage promotion path in memory.
type fakeGateLiveRepo struct {
	repository.LiveRepository
	group        *entity.SessionGroup
	progress     []entity.GroupStageProgress
	groupUpdates int
}

func (r *fakeGateLiveRepo) GetGroup(_ context.Context, id string) (*entity.SessionGroup, error) {
	if r.group == nil || r.group.ID != id {
		return nil, apperrors.NotFound("not_found", nil)
	}
	row := *r.group
	return &row, nil
}

func (r *fakeGateLiveRepo) TenantIDForSession(_ context.Context, _ string) (string, error) {
	return liveGateTenant, nil
}

func (r *fakeGateLiveRepo) GetProgressByGroup(_ context.Context, groupID string) ([]entity.GroupStageProgress, error) {
	out := make([]entity.GroupStageProgress, 0, len(r.progress))
	for i := range r.progress {
		if r.progress[i].GroupID == groupID {
			out = append(out, r.progress[i])
		}
	}
	return out, nil
}

func (r *fakeGateLiveRepo) UpsertProgress(_ context.Context, p *entity.GroupStageProgress) error {
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

func (r *fakeGateLiveRepo) UpdateGroup(_ context.Context, g *entity.SessionGroup) error {
	row := *g
	r.group = &row
	r.groupUpdates++
	return nil
}

// stubGroupCompletionValidator records calls and returns a scripted result.
type stubGroupCompletionValidator struct {
	err        error
	calls      int
	lastTenant string
}

func (v *stubGroupCompletionValidator) ValidateGroupCompletion(_ context.Context, _ *entity.SessionGroup, tenantID string) error {
	v.calls++
	v.lastTenant = tenantID
	return v.err
}

// newLiveGateFixture wires a service over a group whose LAST leaf is being
// completed: leaf-1 is still LOCKED, leaf-2 already COMPLETED, so completing
// leaf-1 makes every progress row done and triggers the promotion.
func newLiveGateFixture(validator live.GroupCompletionValidator) (*fakeGateLiveRepo, *live.Service) {
	repo := &fakeGateLiveRepo{
		group: &entity.SessionGroup{
			BaseModel: entity.BaseModel{ID: liveGateGroupID},
			SessionID: liveGateSessionID,
			Status:    entity.GroupWaiting,
		},
		progress: []entity.GroupStageProgress{
			{GroupID: liveGateGroupID, SessionSubstageID: "leaf-1", Status: entity.ProgressLocked},
			{GroupID: liveGateGroupID, SessionSubstageID: "leaf-2", Status: entity.ProgressCompleted},
		},
	}
	svc := live.NewService(repo, nil, sse.NewHub(), validator)
	return repo, svc
}

// A gate rejection must surface as an explicit error and leave the group WAITING.
func TestOverrideStagePresentUnassessedRejected(t *testing.T) {
	repo, svc := newLiveGateFixture(&stubGroupCompletionValidator{
		err: apperrors.BadRequest("present_participants_unassessed", errors.New("participant p1 ungraded")),
	})

	_, err := svc.OverrideStage(context.Background(), liveGateGroupID, "leaf-1",
		live.ActionComplete, "actor-1", string(entity.RoleAdmin), liveGateTenant)
	requireAppErrorCode(t, err, "present_participants_unassessed")
	if repo.groupUpdates != 0 {
		t.Fatalf("group updates = %d, want 0 (promotion must be rejected)", repo.groupUpdates)
	}
	if repo.group.Status != entity.GroupWaiting {
		t.Fatalf("group status = %q, want %q", repo.group.Status, entity.GroupWaiting)
	}
}

// A passing gate lets the promotion complete the group.
func TestOverrideStagePromotesWhenGatePasses(t *testing.T) {
	repo, svc := newLiveGateFixture(&stubGroupCompletionValidator{})

	if _, err := svc.OverrideStage(context.Background(), liveGateGroupID, "leaf-1",
		live.ActionComplete, "actor-1", string(entity.RoleAdmin), liveGateTenant); err != nil {
		t.Fatalf("OverrideStage promotion with passing gate: %v", err)
	}
	if repo.group.Status != entity.GroupCompleted {
		t.Fatalf("group status = %q, want %q", repo.group.Status, entity.GroupCompleted)
	}
}

// The gate runs exactly once per promotion attempt, with the caller tenant.
func TestOverrideStagePromotionCallsGateOnceWithTenant(t *testing.T) {
	v := &stubGroupCompletionValidator{}
	_, svc := newLiveGateFixture(v)

	if _, err := svc.OverrideStage(context.Background(), liveGateGroupID, "leaf-1",
		live.ActionComplete, "actor-1", string(entity.RoleAdmin), liveGateTenant); err != nil {
		t.Fatalf("OverrideStage: %v", err)
	}
	if v.calls != 1 {
		t.Fatalf("gate calls = %d, want 1", v.calls)
	}
	if v.lastTenant != liveGateTenant {
		t.Fatalf("gate tenant = %q, want %q", v.lastTenant, liveGateTenant)
	}
}

// A missing validator is an explicit wiring error: the gate must never be
// silently skipped on the promotion path.
func TestOverrideStageNilValidatorRejectsPromotion(t *testing.T) {
	repo, svc := newLiveGateFixture(nil)

	_, err := svc.OverrideStage(context.Background(), liveGateGroupID, "leaf-1",
		live.ActionComplete, "actor-1", string(entity.RoleAdmin), liveGateTenant)
	requireAppErrorCode(t, err, "internal_error")
	if repo.groupUpdates != 0 {
		t.Fatalf("group updates = %d, want 0 (nil validator must not promote)", repo.groupUpdates)
	}
}
