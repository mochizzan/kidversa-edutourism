package auth_test

import (
	"context"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/usecase"
)

// Attendance-aware CompleteSession gate: only participants marked present
// (attendance is_present=true) must be fully graded; unmarked (belum absen)
// and explicitly absent participants are exempt and never block completion.

const (
	attGateSessionID = "session-att-gate"
	attGateTenantID  = "tenant-att"
	attGatePartID    = "participant-att"
)

// fakeSessionGateAttendanceRepo serves firstUngradedGroup's present-participant
// lookup over in-memory rows.
type fakeSessionGateAttendanceRepo struct {
	repository.AttendanceRepository
	rows []entity.ParticipantAttendance
}

func (r *fakeSessionGateAttendanceRepo) ListBySession(_ context.Context, sessionID, _ string) ([]entity.ParticipantAttendance, error) {
	out := make([]entity.ParticipantAttendance, 0, len(r.rows))
	for i := range r.rows {
		if r.rows[i].SessionID == sessionID {
			out = append(out, r.rows[i])
		}
	}
	return out, nil
}

// newAttendanceGateFixture wires a CompleteSession usecase with ONE participant
// (zero scores) and the given attendance rows.
func newAttendanceGateFixture(attendance []entity.ParticipantAttendance) (*usecase.SessionUsecase, *fakeCompleteGateSessionRepo) {
	gid := "group-att"
	sess := &entity.Session{
		BaseModel: entity.BaseModel{ID: attGateSessionID},
		TenantID:  completeGateTenant(attGateTenantID),
		Status:    entity.SessionActive,
	}
	assess := &fakeCompleteGateAssessmentRepo{
		tenantID: attGateTenantID,
		scores:   map[string]int{},
	}
	uc, repo := newCompleteGateUsecase(
		sess,
		[]entity.SessionGroup{{
			BaseModel: entity.BaseModel{ID: "group-att"},
			SessionID: attGateSessionID,
			Name:      "Kelompok Hijau",
			Status:    entity.GroupInProgress,
		}},
		[]entity.Participant{{
			BaseModel: entity.BaseModel{ID: attGatePartID},
			GroupID:   &gid,
			ChildName: "Siti Aminah",
		}},
		[]entity.SessionSubstage{
			{BaseModel: entity.BaseModel{ID: "ssub-att-1"}, SessionID: attGateSessionID},
			{BaseModel: entity.BaseModel{ID: "ssub-att-2"}, SessionID: attGateSessionID},
		},
		assess,
	)
	uc.SetAttendanceRepo(&fakeSessionGateAttendanceRepo{rows: attendance})
	return uc, repo
}

// A participant marked present with no scores still rejects completion.
func TestCompleteSessionPresentUnassessedRejected(t *testing.T) {
	uc, repo := newAttendanceGateFixture([]entity.ParticipantAttendance{{
		BaseModel:     entity.BaseModel{ID: "a1"},
		ParticipantID: attGatePartID,
		SessionID:     attGateSessionID,
		IsPresent:     true,
	}})

	_, err := uc.CompleteSession(context.Background(), attGateSessionID, attGateTenantID)
	requireAppErrorCode(t, err, "grading_incomplete")
	if repo.session.Status != entity.SessionActive {
		t.Fatalf("session status = %q, want %q on rejection", repo.session.Status, entity.SessionActive)
	}
}

// An explicitly absent, ungraded participant never blocks completion.
func TestCompleteSessionAbsentUnassessedCompletes(t *testing.T) {
	uc, repo := newAttendanceGateFixture([]entity.ParticipantAttendance{{
		BaseModel:     entity.BaseModel{ID: "a1"},
		ParticipantID: attGatePartID,
		SessionID:     attGateSessionID,
		IsPresent:     false,
	}})

	got, err := uc.CompleteSession(context.Background(), attGateSessionID, attGateTenantID)
	if err != nil {
		t.Fatalf("CompleteSession must succeed when the ungraded participant is absent: %v", err)
	}
	if got.Status != entity.SessionCompleted {
		t.Fatalf("session status = %q, want %q", got.Status, entity.SessionCompleted)
	}
	if repo.stageUpdates == 0 {
		t.Fatal("expected stage cascade on completion")
	}
}

// Attendance wired but nobody marked yet (semua belum absen): ungraded
// participants are exempt and completion must succeed.
func TestCompleteSessionUnmarkedUnassessedCompletes(t *testing.T) {
	uc, repo := newAttendanceGateFixture(nil)

	got, err := uc.CompleteSession(context.Background(), attGateSessionID, attGateTenantID)
	if err != nil {
		t.Fatalf("CompleteSession must succeed when nobody has been marked present: %v", err)
	}
	if got.Status != entity.SessionCompleted {
		t.Fatalf("session status = %q, want %q", got.Status, entity.SessionCompleted)
	}
	if repo.stageUpdates == 0 {
		t.Fatal("expected stage cascade on completion")
	}
}
