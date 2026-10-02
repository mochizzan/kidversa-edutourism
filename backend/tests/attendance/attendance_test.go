package attendance_test

import (
	"context"
	"errors"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/usecase/attendance"
)

type fakeAttendanceRepo struct {
	upserted *entity.ParticipantAttendance
}

func (r *fakeAttendanceRepo) GetByParticipantSession(ctx context.Context, participantID, sessionID, tenantID string) (*entity.ParticipantAttendance, error) {
	return nil, nil
}

func (r *fakeAttendanceRepo) ListBySession(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantAttendance, error) {
	return nil, nil
}

func (r *fakeAttendanceRepo) Upsert(ctx context.Context, a *entity.ParticipantAttendance) error {
	r.upserted = a
	return nil
}

// fakeSessionRepo is a hand-rolled SessionRepository fake. Only
// GetSessionGroupByParticipant is configurable; the rest are inert.
type fakeSessionRepo struct {
	group    *entity.SessionGroup
	groupErr error
}

func (r *fakeSessionRepo) CreateSession(ctx context.Context, s *entity.Session) error { return nil }
func (r *fakeSessionRepo) GetSessionByID(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	return nil, nil
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
func (r *fakeSessionRepo) ParticipantNameExists(ctx context.Context, tenantID, childName string) (bool, error) {
	return false, nil
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
func (r *fakeSessionRepo) UpdateParticipantTokenIfAvailable(ctx context.Context, participantID, token string, expiresAt interface{}) (bool, error) {
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
func (r *fakeSessionRepo) GetSessionGroupByParticipant(ctx context.Context, participantID string) (*entity.SessionGroup, error) {
	return r.group, r.groupErr
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

func TestUpsert_GroupCompleted_Fails(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := &fakeSessionRepo{
		group: &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "group-1"}, Status: entity.GroupCompleted},
	}
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), "participant-1", "session-1", true, "facilitator-1", "tenant-1")
	requireAppErrorCode(t, err, "group_completed")
	if attendanceRepo.upserted != nil {
		t.Fatal("expected no attendance write on a COMPLETED group")
	}
}

func TestUpsert_GroupNotCompleted_Succeeds(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := &fakeSessionRepo{
		group: &entity.SessionGroup{BaseModel: entity.BaseModel{ID: "group-1"}, Status: entity.GroupInProgress},
	}
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	a, err := uc.Upsert(context.Background(), "participant-1", "session-1", true, "facilitator-1", "tenant-1")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if a == nil || attendanceRepo.upserted == nil {
		t.Fatal("expected attendance to be written")
	}
	if !attendanceRepo.upserted.IsPresent {
		t.Fatal("expected is_present to be persisted")
	}
}

func TestUpsert_NoGroup_Succeeds(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := &fakeSessionRepo{}
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), "participant-1", "session-1", false, "facilitator-1", "tenant-1")
	if err != nil {
		t.Fatalf("expected success for participant without group, got %v", err)
	}
	if attendanceRepo.upserted == nil {
		t.Fatal("expected attendance to be written")
	}
}

func TestUpsert_GroupResolverError_Propagates(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := &fakeSessionRepo{groupErr: errors.New("db down")}
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), "participant-1", "session-1", true, "facilitator-1", "tenant-1")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if attendanceRepo.upserted != nil {
		t.Fatal("expected no attendance write when the group lookup fails")
	}
}
