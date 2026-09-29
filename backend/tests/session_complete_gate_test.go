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
// Fakes for the CompleteSession grading gate.
// ---------------------------------------------------------------------------

// fakeCompleteGateSessionRepo implements just enough of SessionRepository for
// CompleteSession. It emulates the tenant scope of GetSessionByID.
type fakeCompleteGateSessionRepo struct {
	repository.SessionRepository
	session      *entity.Session
	stages       []entity.SessionStage
	groups       []entity.SessionGroup
	participants []entity.Participant
	stageUpdates int
	groupUpdates int
}

func (r *fakeCompleteGateSessionRepo) GetSessionByID(_ context.Context, id, tenantID string) (*entity.Session, error) {
	if id != r.session.ID {
		return nil, apperrors.NotFound("not_found", nil)
	}
	// Mirror the real repo: a non-empty tenant must own the session.
	if tenantID != "" && (r.session.TenantID == nil || *r.session.TenantID != tenantID) {
		return nil, apperrors.NotFound("not_found", nil)
	}
	s := *r.session
	return &s, nil
}

func (r *fakeCompleteGateSessionRepo) UpdateSession(_ context.Context, s *entity.Session) error {
	r.session.Status = s.Status
	return nil
}

func (r *fakeCompleteGateSessionRepo) ListSessionStages(_ context.Context, _ string) ([]entity.SessionStage, error) {
	return r.stages, nil
}

func (r *fakeCompleteGateSessionRepo) UpdateSessionStage(_ context.Context, _ *entity.SessionStage) error {
	r.stageUpdates++
	return nil
}

func (r *fakeCompleteGateSessionRepo) ListSessionGroups(_ context.Context, _ string) ([]entity.SessionGroup, error) {
	return r.groups, nil
}

func (r *fakeCompleteGateSessionRepo) UpdateSessionGroup(_ context.Context, _ *entity.SessionGroup) error {
	r.groupUpdates++
	return nil
}

func (r *fakeCompleteGateSessionRepo) ListParticipants(_ context.Context, _, groupID, _ string) ([]entity.Participant, error) {
	out := make([]entity.Participant, 0, len(r.participants))
	for i := range r.participants {
		if r.participants[i].GroupID != nil && *r.participants[i].GroupID == groupID {
			out = append(out, r.participants[i])
		}
	}
	return out, nil
}

// fakeCompleteGateSubstageRepo returns the session's Kegiatan leaves.
type fakeCompleteGateSubstageRepo struct {
	repository.SessionSubstageRepository
	subs []entity.SessionSubstage
}

func (r *fakeCompleteGateSubstageRepo) ListSessionSubstages(_ context.Context, _ string) ([]entity.SessionSubstage, error) {
	return r.subs, nil
}

// fakeCompleteGateAssessmentRepo emulates the tenant-scoped assessment read:
// a non-empty tenant that does not own the session's rows sees no rows (this
// is exactly how the nil-UUID placeholder failed), while an empty tenant skips
// the scope, mirroring GormAssessmentRepository.GetByParticipantStage.
type fakeCompleteGateAssessmentRepo struct {
	repository.AssessmentRepository
	tenantID    string
	scores      map[string]int // "participantID|sessionSubstageID" -> star rating
	seenTenants []string       // tenants the gate looked up with, in order
}

func (r *fakeCompleteGateAssessmentRepo) GetByParticipantStage(_ context.Context, participantID, sessionSubstageID, tenantID string) (*entity.Assessment, error) {
	r.seenTenants = append(r.seenTenants, tenantID)
	if tenantID != "" && tenantID != r.tenantID {
		return nil, apperrors.NotFound("not_found", nil)
	}
	star, ok := r.scores[participantID+"|"+sessionSubstageID]
	if !ok {
		return nil, apperrors.NotFound("not_found", nil)
	}
	return &entity.Assessment{
		ParticipantID:     participantID,
		SessionSubstageID: sessionSubstageID,
		StarRating:        star,
	}, nil
}

func completeGateTenant(s string) *string { return &s }

// newCompleteGateUsecase wires a CompleteSession usecase over the fakes above.
func newCompleteGateUsecase(
	sess *entity.Session,
	groups []entity.SessionGroup,
	participants []entity.Participant,
	subs []entity.SessionSubstage,
	assess *fakeCompleteGateAssessmentRepo,
) (*usecase.SessionUsecase, *fakeCompleteGateSessionRepo) {
	repo := &fakeCompleteGateSessionRepo{
		session:      sess,
		stages:       []entity.SessionStage{{BaseModel: entity.BaseModel{ID: sess.ID + "-stage"}, SessionID: sess.ID, Status: entity.SessionStageActive}},
		groups:       groups,
		participants: participants,
	}
	uc := usecase.NewSessionUsecase(repo, &fakeStageReader{})
	uc.SetSubstageRepos(nil, &fakeCompleteGateSubstageRepo{subs: subs})
	uc.SetAssessmentRepo(assess)
	return uc, repo
}

// TestCompleteSession_AllGraded_Completes is the positive gate case: every
// participant has a star >= 1 assessment for every session Kegiatan leaf, so
// completion must succeed. It also pins the tenant the gate reads with: the
// assessment rows live under the session's own tenant, so any placeholder
// tenant (the nil-UUID regression) yields no rows and fails this test.
func TestCompleteSession_AllGraded_Completes(t *testing.T) {
	const (
		sessionID   = "session-complete-1"
		partID      = "participant-1"
		groupID     = "group-1"
		tenantID    = "tenant-real"
		subStageID1 = "ssub-1"
		subStageID2 = "ssub-2"
	)
	gid := groupID
	sess := &entity.Session{
		BaseModel: entity.BaseModel{ID: sessionID},
		TenantID:  completeGateTenant(tenantID),
		Status:    entity.SessionActive,
	}
	assess := &fakeCompleteGateAssessmentRepo{
		tenantID: tenantID,
		scores: map[string]int{
			partID + "|" + subStageID1: 5,
			partID + "|" + subStageID2: 3,
		},
	}
	uc, repo := newCompleteGateUsecase(
		sess,
		[]entity.SessionGroup{{BaseModel: entity.BaseModel{ID: groupID}, SessionID: sessionID, Name: "Kelompok Merah", Status: entity.GroupInProgress}},
		[]entity.Participant{{BaseModel: entity.BaseModel{ID: partID}, GroupID: &gid, ChildName: "Budi Santoso"}},
		[]entity.SessionSubstage{
			{BaseModel: entity.BaseModel{ID: subStageID1}, SessionID: sessionID},
			{BaseModel: entity.BaseModel{ID: subStageID2}, SessionID: sessionID},
		},
		assess,
	)

	got, err := uc.CompleteSession(context.Background(), sessionID, tenantID)
	if err != nil {
		t.Fatalf("CompleteSession returned error: %v", err)
	}
	if got.Status != entity.SessionCompleted {
		t.Fatalf("expected status %q, got %q", entity.SessionCompleted, got.Status)
	}
	if len(assess.seenTenants) == 0 {
		t.Fatal("gate never queried the assessment repo")
	}
	for i := range assess.seenTenants {
		if assess.seenTenants[i] != tenantID {
			t.Fatalf("gate queried with tenant %q, want the session tenant %q (nil-UUID placeholder regression)", assess.seenTenants[i], tenantID)
		}
	}
	if repo.stageUpdates == 0 || repo.groupUpdates == 0 {
		t.Fatalf("expected stage/group cascade, got stages=%d groups=%d", repo.stageUpdates, repo.groupUpdates)
	}
}

// TestCompleteSession_MissingAssessment_Rejected is the negative gate case: a
// participant with no assessment for one leaf must yield grading_incomplete and
// leave the session ACTIVE.
func TestCompleteSession_MissingAssessment_Rejected(t *testing.T) {
	const (
		sessionID   = "session-complete-2"
		partID      = "participant-1"
		groupID     = "group-1"
		tenantID    = "tenant-real"
		subStageID1 = "ssub-1"
		subStageID2 = "ssub-2"
	)
	gid := groupID
	sess := &entity.Session{
		BaseModel: entity.BaseModel{ID: sessionID},
		TenantID:  completeGateTenant(tenantID),
		Status:    entity.SessionActive,
	}
	assess := &fakeCompleteGateAssessmentRepo{
		tenantID: tenantID,
		scores: map[string]int{
			// Only one of the two leaves is graded.
			partID + "|" + subStageID1: 4,
		},
	}
	uc, repo := newCompleteGateUsecase(
		sess,
		[]entity.SessionGroup{{BaseModel: entity.BaseModel{ID: groupID}, SessionID: sessionID, Name: "Kelompok Biru", Status: entity.GroupInProgress}},
		[]entity.Participant{{BaseModel: entity.BaseModel{ID: partID}, GroupID: &gid, ChildName: "Budi Santoso"}},
		[]entity.SessionSubstage{
			{BaseModel: entity.BaseModel{ID: subStageID1}, SessionID: sessionID},
			{BaseModel: entity.BaseModel{ID: subStageID2}, SessionID: sessionID},
		},
		assess,
	)

	_, err := uc.CompleteSession(context.Background(), sessionID, tenantID)
	requireAppErrorCode(t, err, "grading_incomplete")
	if repo.session.Status != entity.SessionActive {
		t.Fatalf("session must stay %q on rejection, got %q", entity.SessionActive, repo.session.Status)
	}
	if repo.stageUpdates != 0 || repo.groupUpdates != 0 {
		t.Fatalf("no cascade may run on rejection, got stages=%d groups=%d", repo.stageUpdates, repo.groupUpdates)
	}
}

// TestCompleteSession_StarZero_Rejected keeps the absent/not-scored contract:
// star_rating 0 is not a score, so the gate must reject with grading_incomplete.
func TestCompleteSession_StarZero_Rejected(t *testing.T) {
	const (
		sessionID = "session-complete-3"
		partID    = "participant-1"
		groupID   = "group-1"
		tenantID  = "tenant-real"
		subID     = "ssub-1"
	)
	gid := groupID
	sess := &entity.Session{
		BaseModel: entity.BaseModel{ID: sessionID},
		TenantID:  completeGateTenant(tenantID),
		Status:    entity.SessionActive,
	}
	assess := &fakeCompleteGateAssessmentRepo{
		tenantID: tenantID,
		scores:   map[string]int{partID + "|" + subID: 0},
	}
	uc, repo := newCompleteGateUsecase(
		sess,
		[]entity.SessionGroup{{BaseModel: entity.BaseModel{ID: groupID}, SessionID: sessionID, Name: "Kelompok Hijau", Status: entity.GroupInProgress}},
		[]entity.Participant{{BaseModel: entity.BaseModel{ID: partID}, GroupID: &gid, ChildName: "Budi Santoso"}},
		[]entity.SessionSubstage{{BaseModel: entity.BaseModel{ID: subID}, SessionID: sessionID}},
		assess,
	)

	_, err := uc.CompleteSession(context.Background(), sessionID, tenantID)
	requireAppErrorCode(t, err, "grading_incomplete")
	if repo.session.Status != entity.SessionActive {
		t.Fatalf("session must stay %q on rejection, got %q", entity.SessionActive, repo.session.Status)
	}
}
