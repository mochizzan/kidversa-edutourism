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
	rows     map[string]entity.ParticipantAttendance
	listErr  error
}

func attKey(participantID, sessionID, sessionStageID string) string {
	return participantID + "|" + sessionID + "|" + sessionStageID
}

func (r *fakeAttendanceRepo) GetByParticipantSessionStage(_ context.Context, participantID, sessionID, sessionStageID, _ string) (*entity.ParticipantAttendance, error) {
	if a, ok := r.rows[attKey(participantID, sessionID, sessionStageID)]; ok {
		cp := a
		return &cp, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeAttendanceRepo) ListBySession(_ context.Context, sessionID, _ string) ([]entity.ParticipantAttendance, error) {
	if r.listErr != nil {
		return nil, r.listErr
	}
	out := make([]entity.ParticipantAttendance, 0, len(r.rows))
	for _, a := range r.rows {
		if a.SessionID == sessionID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (r *fakeAttendanceRepo) ListBySessionStage(_ context.Context, sessionID, sessionStageID, _ string) ([]entity.ParticipantAttendance, error) {
	if r.listErr != nil {
		return nil, r.listErr
	}
	out := make([]entity.ParticipantAttendance, 0, len(r.rows))
	for _, a := range r.rows {
		if a.SessionID == sessionID && a.SessionStageID == sessionStageID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (r *fakeAttendanceRepo) ListByParticipantSession(_ context.Context, participantID, sessionID, _ string) ([]entity.ParticipantAttendance, error) {
	out := make([]entity.ParticipantAttendance, 0, len(r.rows))
	for _, a := range r.rows {
		if a.ParticipantID == participantID && a.SessionID == sessionID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (r *fakeAttendanceRepo) Upsert(_ context.Context, a *entity.ParticipantAttendance) error {
	if r.rows == nil {
		r.rows = map[string]entity.ParticipantAttendance{}
	}
	r.rows[attKey(a.ParticipantID, a.SessionID, a.SessionStageID)] = *a
	r.upserted = a
	return nil
}

// fakeSessionRepo is a hand-rolled SessionRepository fake. Only
// GetSessionGroupByParticipant and ListSessionStages are configurable; the
// rest are inert.
type fakeSessionRepo struct {
	group    *entity.SessionGroup
	groupErr error
	stages   []entity.SessionStage
	stageErr error
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
func (r *fakeSessionRepo) ListSessionStages(_ context.Context, _ string) ([]entity.SessionStage, error) {
	if r.stageErr != nil {
		return nil, r.stageErr
	}
	return r.stages, nil
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

func attSessionRepo(group *entity.SessionGroup) *fakeSessionRepo {
	return &fakeSessionRepo{
		group: group,
		stages: []entity.SessionStage{
			{BaseModel: entity.BaseModel{ID: "stage-A"}, SessionID: "session-1"},
			{BaseModel: entity.BaseModel{ID: "stage-B"}, SessionID: "session-1"},
		},
	}
}

func TestUpsert_GroupCompleted_Fails(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := attSessionRepo(&entity.SessionGroup{BaseModel: entity.BaseModel{ID: "group-1"}, Status: entity.GroupCompleted})
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), "participant-1", "session-1", "stage-A", true, "facilitator-1", "tenant-1")
	requireAppErrorCode(t, err, "group_completed")
	if attendanceRepo.upserted != nil {
		t.Fatal("expected no attendance write on a COMPLETED group")
	}
}

func TestUpsert_GroupNotCompleted_Succeeds(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := attSessionRepo(&entity.SessionGroup{BaseModel: entity.BaseModel{ID: "group-1"}, Status: entity.GroupInProgress})
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	a, err := uc.Upsert(context.Background(), "participant-1", "session-1", "stage-A", true, "facilitator-1", "tenant-1")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if a == nil || attendanceRepo.upserted == nil {
		t.Fatal("expected attendance to be written")
	}
	if !attendanceRepo.upserted.IsPresent {
		t.Fatal("expected is_present to be persisted")
	}
	if attendanceRepo.upserted.SessionStageID != "stage-A" {
		t.Fatalf("expected session_stage_id stage-A, got %q", attendanceRepo.upserted.SessionStageID)
	}
}

func TestUpsert_NoGroup_Succeeds(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := attSessionRepo(nil)
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), "participant-1", "session-1", "stage-A", false, "facilitator-1", "tenant-1")
	if err != nil {
		t.Fatalf("expected success for participant without group, got %v", err)
	}
	if attendanceRepo.upserted == nil {
		t.Fatal("expected attendance to be written")
	}
}

func TestUpsert_MissingStageID_Fails(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := attSessionRepo(nil)
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), "participant-1", "session-1", "", true, "facilitator-1", "tenant-1")
	requireAppErrorCode(t, err, "validation_error")
	if attendanceRepo.upserted != nil {
		t.Fatal("expected no attendance write without a topic")
	}
}

func TestUpsert_ForeignStage_Fails(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := attSessionRepo(nil)
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), "participant-1", "session-1", "stage-other-session", true, "facilitator-1", "tenant-1")
	requireAppErrorCode(t, err, "topic_not_in_session")
	if attendanceRepo.upserted != nil {
		t.Fatal("expected no attendance write for a foreign stage")
	}
}

func TestUpsert_StageLookupError_Propagates(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := attSessionRepo(nil)
	sessionRepo.stageErr = errors.New("db down")
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), "participant-1", "session-1", "stage-A", true, "facilitator-1", "tenant-1")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if attendanceRepo.upserted != nil {
		t.Fatal("expected no attendance write when the stage lookup fails")
	}
}

func TestUpsert_TopicB_DoesNotTouchTopicA(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := attSessionRepo(nil)
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	if _, err := uc.Upsert(context.Background(), "participant-1", "session-1", "stage-A", true, "facilitator-1", "tenant-1"); err != nil {
		t.Fatalf("topic A upsert: %v", err)
	}
	if _, err := uc.Upsert(context.Background(), "participant-1", "session-1", "stage-B", false, "facilitator-1", "tenant-1"); err != nil {
		t.Fatalf("topic B upsert: %v", err)
	}
	aRow, err := attendanceRepo.GetByParticipantSessionStage(context.Background(), "participant-1", "session-1", "stage-A", "tenant-1")
	if err != nil {
		t.Fatalf("topic A read: %v", err)
	}
	if !aRow.IsPresent {
		t.Fatal("topic A row must stay present after topic B is marked absent")
	}
	bRow, err := attendanceRepo.GetByParticipantSessionStage(context.Background(), "participant-1", "session-1", "stage-B", "tenant-1")
	if err != nil {
		t.Fatalf("topic B read: %v", err)
	}
	if bRow.IsPresent {
		t.Fatal("topic B row must hold its own absent value")
	}
}

func TestList_FiltersByTopic(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := attSessionRepo(nil)
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	if _, err := uc.Upsert(context.Background(), "participant-1", "session-1", "stage-A", true, "facilitator-1", "tenant-1"); err != nil {
		t.Fatalf("topic A upsert: %v", err)
	}
	if _, err := uc.Upsert(context.Background(), "participant-1", "session-1", "stage-B", false, "facilitator-1", "tenant-1"); err != nil {
		t.Fatalf("topic B upsert: %v", err)
	}
	scoped, err := uc.ListBySessionStage(context.Background(), "session-1", "stage-A", "tenant-1")
	if err != nil {
		t.Fatalf("scoped list: %v", err)
	}
	if len(scoped) != 1 || scoped[0].SessionStageID != "stage-A" {
		t.Fatalf("scoped list = %+v, want exactly the stage-A row", scoped)
	}
	all, err := uc.ListBySessionStage(context.Background(), "session-1", "", "tenant-1")
	if err != nil {
		t.Fatalf("unscoped list: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("unscoped list rows = %d, want 2 (compat: all Topics)", len(all))
	}
}

func TestUpsert_GroupResolverError_Propagates(t *testing.T) {
	attendanceRepo := &fakeAttendanceRepo{}
	sessionRepo := attSessionRepo(nil)
	sessionRepo.groupErr = errors.New("db down")
	uc := attendance.NewUsecase(attendanceRepo, sessionRepo)

	_, err := uc.Upsert(context.Background(), "participant-1", "session-1", "stage-A", true, "facilitator-1", "tenant-1")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if attendanceRepo.upserted != nil {
		t.Fatal("expected no attendance write when the group lookup fails")
	}
}
