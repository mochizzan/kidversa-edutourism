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
// fakeParticipantSessionRepo embeds the SessionRepository interface so only the
// methods exercised by CreateParticipant/DeleteParticipant carry real state;
// any other method panics on the nil embedded interface, keeping the test
// honest about which repository calls the usecase makes.
// ---------------------------------------------------------------------------

type fakeParticipantSessionRepo struct {
	repository.SessionRepository

	nameExists bool
	getErr     error
	created    *entity.Participant
	deletedID  string
}

func (r *fakeParticipantSessionRepo) ParticipantNameExists(context.Context, string, string) (bool, error) {
	return r.nameExists, nil
}

func (r *fakeParticipantSessionRepo) CreateParticipant(_ context.Context, p *entity.Participant) error {
	cp := *p
	r.created = &cp
	return nil
}

func (r *fakeParticipantSessionRepo) GetParticipantByID(context.Context, string, string) (*entity.Participant, error) {
	if r.getErr != nil {
		return nil, r.getErr
	}
	return &entity.Participant{}, nil
}

func (r *fakeParticipantSessionRepo) DeleteParticipant(_ context.Context, id string) error {
	r.deletedID = id
	return nil
}

// TestCreateParticipantRejectsDuplicateName guards the duplicate-name rule:
// when the name already exists, creation must fail with
// participant_duplicate_name and nothing must be persisted.
func TestCreateParticipantRejectsDuplicateName(t *testing.T) {
	repo := &fakeParticipantSessionRepo{nameExists: true}
	uc := usecase.NewSessionUsecase(repo, nil)

	p, err := uc.CreateParticipant(context.Background(), "tenant-1", "", "",
		"  Budi Santoso ", 8, "SD A", "Andi", "08123456789", "", false)
	requireAppErrorCode(t, err, "participant_duplicate_name")
	if p != nil {
		t.Fatalf("expected nil participant on duplicate name, got %+v", p)
	}
	if repo.created != nil {
		t.Fatal("duplicate participant name must not be persisted")
	}
}

// TestCreateParticipantAllowsUniqueName pins the happy path so the duplicate
// check cannot degenerate into rejecting every create.
func TestCreateParticipantAllowsUniqueName(t *testing.T) {
	repo := &fakeParticipantSessionRepo{nameExists: false}
	uc := usecase.NewSessionUsecase(repo, nil)

	p, err := uc.CreateParticipant(context.Background(), "tenant-1", "", "",
		"Budi Santoso", 8, "SD A", "Andi", "08123456789", "", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p == nil || repo.created == nil {
		t.Fatal("expected participant to be created")
	}
	if repo.created.ChildName != "Budi Santoso" {
		t.Fatalf("persisted child_name = %q, want %q", repo.created.ChildName, "Budi Santoso")
	}
}

// TestDeleteParticipantHonorsTenantScope guards the global DELETE
// /api/participants/:id flow: the tenant lookup must fail the delete for a
// participant outside the caller's tenant, and must not reach the repository,
// which deletes by ID alone.
func TestDeleteParticipantHonorsTenantScope(t *testing.T) {
	repo := &fakeParticipantSessionRepo{getErr: apperrors.NotFound("not_found", nil)}
	uc := usecase.NewSessionUsecase(repo, nil)

	err := uc.DeleteParticipant(context.Background(), "pid-1", "tenant-other")
	requireAppErrorCode(t, err, "not_found")
	if repo.deletedID != "" {
		t.Fatalf("cross-tenant delete must not reach the repository, got delete(%q)", repo.deletedID)
	}

	repo.getErr = nil
	if err := uc.DeleteParticipant(context.Background(), "pid-1", "tenant-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.deletedID != "pid-1" {
		t.Fatalf("deletedID = %q, want %q", repo.deletedID, "pid-1")
	}
}
