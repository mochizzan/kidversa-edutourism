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
}

func (r *fakeAssessmentRepo) Create(ctx context.Context, a *entity.Assessment) error {
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
func (r *fakeAssessmentRepo) Delete(ctx context.Context, id string) error { return nil }
func (r *fakeAssessmentRepo) GetGroupFacilitatorIDByParticipant(ctx context.Context, participantID string) (*string, error) {
	return r.ownerID, r.ownerErr
}

type fakeSessionRepo struct {
	session *entity.Session
	err     error
}

func (r *fakeSessionRepo) CreateSession(ctx context.Context, s *entity.Session) error { return nil }
func (r *fakeSessionRepo) GetSessionByID(ctx context.Context, id, tenantID string) (*entity.Session, error) {
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
	return nil, nil
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
func (r *fakeSessionRepo) Transaction(ctx context.Context, fn func(tx repository.SessionRepository) error) error {
	return nil
}
func (r *fakeSessionRepo) TenantIDForSession(ctx context.Context, sessionID string) (string, error) {
	return "", nil
}
func (r *fakeSessionRepo) GetGroupFacilitatorID(ctx context.Context, groupID string) (*string, error) {
	return nil, nil
}
func (r *fakeSessionRepo) FacilitatorOwnsAnyGroup(ctx context.Context, sessionID, facilitatorID string) (bool, error) {
	return false, nil
}

type fakeBadgeEvaluator struct{}

func (b *fakeBadgeEvaluator) EvaluateAfterAssessment(ctx context.Context, participantID, sessionSubstageID string) error {
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
	}, 3, "Good job", owner, owner, string(entity.RoleFasilitator), time.Now(), "", "tenant-1")
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
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "", "tenant-1")
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
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "", "tenant-1")
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
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "", "tenant-1")
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
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "", "tenant-1")
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
	}, 3, "", owner, owner, string(entity.RoleFasilitator), time.Now(), "", "tenant-1")
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
	}, 3, "", "facilitator-1", "facilitator-1", string(entity.RoleFasilitator), time.Now(), "", "tenant-1")
	requireAppErrorCode(t, err, "not_group_owner")
}
