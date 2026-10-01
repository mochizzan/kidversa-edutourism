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
// fakeGroupSessionRepo is an in-memory SessionRepository for UpdateGroup: it
// serves GetSessionGroupByID from a map and records the last persisted group.
// Embedding the interface keeps the test honest — any other repository call
// panics on the nil embedded interface.
// ---------------------------------------------------------------------------

type fakeGroupSessionRepo struct {
	repository.SessionRepository
	groups  map[string]*entity.SessionGroup
	updated *entity.SessionGroup
}

func (r *fakeGroupSessionRepo) GetSessionGroupByID(_ context.Context, id, _ string) (*entity.SessionGroup, error) {
	if g, ok := r.groups[id]; ok {
		clone := *g
		return &clone, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeGroupSessionRepo) UpdateSessionGroup(_ context.Context, g *entity.SessionGroup) error {
	clone := *g
	r.updated = &clone
	r.groups[g.ID] = &clone
	return nil
}

// newGroupFacilitatorUsecase wires a SessionUsecase over the fake group repo
// plus a fake user repo holding the given accounts (reuses fakeUserRepo from
// users_usecase_test.go — same package).
func newGroupFacilitatorUsecase(
	groups map[string]*entity.SessionGroup,
	users map[string]*entity.User,
) (*usecase.SessionUsecase, *fakeGroupSessionRepo) {
	repo := &fakeGroupSessionRepo{groups: groups}
	uc := usecase.NewSessionUsecase(repo, nil)
	uc.SetUserRepo(&fakeUserRepo{users: users})
	return uc, repo
}

func groupWithFacilitator(id, name string, facilitatorID *string) *entity.SessionGroup {
	return &entity.SessionGroup{
		BaseModel:     entity.BaseModel{ID: id},
		SessionID:     "session-1",
		Name:          name,
		Status:        entity.GroupWaiting,
		FacilitatorID: facilitatorID,
	}
}

func facilitatorAccount(id, name string) *entity.User {
	return &entity.User{
		BaseModel: entity.BaseModel{ID: id},
		Name:      name,
		Role:      entity.RoleFasilitator,
		IsActive:  true,
	}
}

// TestUpdateGroup_AssignsDifferentFacilitatorsPerGroup pins per-group
// assignment: group A keeps its own facilitator while group B gets a DIFFERENT
// one — the two writes must not clobber each other.
func TestUpdateGroup_AssignsDifferentFacilitatorsPerGroup(t *testing.T) {
	uc, repo := newGroupFacilitatorUsecase(
		map[string]*entity.SessionGroup{
			"g-a": groupWithFacilitator("g-a", "Kelompok Alpha", nil),
			"g-b": groupWithFacilitator("g-b", "Kelompok Beta", nil),
		},
		map[string]*entity.User{
			"f-1": facilitatorAccount("f-1", "Budi"),
			"f-2": facilitatorAccount("f-2", "Siti"),
		},
	)

	if _, err := uc.UpdateGroup(context.Background(), "g-a", "", "", "tenant-1", new("f-1")); err != nil {
		t.Fatalf("assign f-1 to g-a: unexpected error: %v", err)
	}
	if _, err := uc.UpdateGroup(context.Background(), "g-b", "", "", "tenant-1", new("f-2")); err != nil {
		t.Fatalf("assign f-2 to g-b: unexpected error: %v", err)
	}

	gotA := repo.groups["g-a"].FacilitatorID
	gotB := repo.groups["g-b"].FacilitatorID
	if gotA == nil || *gotA != "f-1" {
		t.Fatalf("g-a facilitator = %v, want f-1", gotA)
	}
	if gotB == nil || *gotB != "f-2" {
		t.Fatalf("g-b facilitator = %v, want f-2", gotB)
	}
	if *gotA == *gotB {
		t.Fatal("groups must keep different facilitators, got the same id on both")
	}
}

// TestUpdateGroup_AllowsSameFacilitatorOnTwoGroups pins that one facilitator
// may legitimately cover several groups (no uniqueness constraint per user).
func TestUpdateGroup_AllowsSameFacilitatorOnTwoGroups(t *testing.T) {
	uc, repo := newGroupFacilitatorUsecase(
		map[string]*entity.SessionGroup{
			"g-a": groupWithFacilitator("g-a", "Kelompok Alpha", nil),
			"g-b": groupWithFacilitator("g-b", "Kelompok Beta", nil),
		},
		map[string]*entity.User{
			"f-1": facilitatorAccount("f-1", "Budi"),
		},
	)

	if _, err := uc.UpdateGroup(context.Background(), "g-a", "", "", "tenant-1", new("f-1")); err != nil {
		t.Fatalf("assign f-1 to g-a: unexpected error: %v", err)
	}
	if _, err := uc.UpdateGroup(context.Background(), "g-b", "", "", "tenant-1", new("f-1")); err != nil {
		t.Fatalf("assign f-1 to g-b: unexpected error: %v", err)
	}

	if got := repo.groups["g-a"].FacilitatorID; got == nil || *got != "f-1" {
		t.Fatalf("g-a facilitator = %v, want f-1", got)
	}
	if got := repo.groups["g-b"].FacilitatorID; got == nil || *got != "f-1" {
		t.Fatalf("g-b facilitator = %v, want f-1", got)
	}
}

// TestUpdateGroup_UnknownFacilitatorRejected guards against assigning a user
// id that does not exist: invalid_facilitator and NO persistence.
func TestUpdateGroup_UnknownFacilitatorRejected(t *testing.T) {
	uc, repo := newGroupFacilitatorUsecase(
		map[string]*entity.SessionGroup{
			"g-a": groupWithFacilitator("g-a", "Kelompok Alpha", nil),
		},
		map[string]*entity.User{
			"f-1": facilitatorAccount("f-1", "Budi"),
		},
	)

	_, err := uc.UpdateGroup(context.Background(), "g-a", "", "", "tenant-1", new("ghost-user"))
	requireAppErrorCode(t, err, "invalid_facilitator")
	if repo.updated != nil {
		t.Fatal("unknown facilitator must not be persisted")
	}
	if repo.groups["g-a"].FacilitatorID != nil {
		t.Fatalf("g-a facilitator = %v, want nil after rejection", repo.groups["g-a"].FacilitatorID)
	}
}

// TestUpdateGroup_NonFacilitatorRoleRejected guards the role gate: an existing
// account without the FASILITATOR role cannot be attached to a group.
func TestUpdateGroup_NonFacilitatorRoleRejected(t *testing.T) {
	uc, repo := newGroupFacilitatorUsecase(
		map[string]*entity.SessionGroup{
			"g-a": groupWithFacilitator("g-a", "Kelompok Alpha", nil),
		},
		map[string]*entity.User{
			"admin-1": {BaseModel: entity.BaseModel{ID: "admin-1"}, Name: "Admin", Role: entity.RoleAdmin},
		},
	)

	_, err := uc.UpdateGroup(context.Background(), "g-a", "", "", "tenant-1", new("admin-1"))
	requireAppErrorCode(t, err, "invalid_facilitator")
	if repo.updated != nil {
		t.Fatal("non-facilitator account must not be persisted")
	}
	if repo.groups["g-a"].FacilitatorID != nil {
		t.Fatalf("g-a facilitator = %v, want nil after rejection", repo.groups["g-a"].FacilitatorID)
	}
}

// TestUpdateGroup_NilClearsFacilitator pins the clear path: a nil facilitator
// wipes the stored reference without needing a user lookup.
func TestUpdateGroup_NilClearsFacilitator(t *testing.T) {
	uc, repo := newGroupFacilitatorUsecase(
		map[string]*entity.SessionGroup{
			"g-a": groupWithFacilitator("g-a", "Kelompok Alpha", new("f-1")),
		},
		map[string]*entity.User{}, // no users at all: clearing must not hit the user repo
	)

	if _, err := uc.UpdateGroup(context.Background(), "g-a", "", "", "tenant-1", nil); err != nil {
		t.Fatalf("clear facilitator: unexpected error: %v", err)
	}
	if repo.groups["g-a"].FacilitatorID != nil {
		t.Fatalf("g-a facilitator = %v, want nil after clear", repo.groups["g-a"].FacilitatorID)
	}
}
