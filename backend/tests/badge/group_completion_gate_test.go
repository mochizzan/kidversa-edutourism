package badge_test

import (
	"context"
	"errors"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// ── Attendance-aware group-completion gate fakes ──
//
// Method sets the fixture's embedded interfaces do not implement. They live
// here (same package) so badge_flow_test.go only gains the fixture field.

// fakeAttendanceRepo is an in-memory participant_attendances table.
type fakeAttendanceRepo struct {
	repository.AttendanceRepository
	rows []entity.ParticipantAttendance
}

func (r *fakeAttendanceRepo) ListBySession(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantAttendance, error) {
	out := make([]entity.ParticipantAttendance, 0, len(r.rows))
	for i := range r.rows {
		if r.rows[i].SessionID == sessionID {
			out = append(out, r.rows[i])
		}
	}
	return out, nil
}

// GetByParticipantStage mirrors the production lookup: exact slot hit or
// NotFound (the gate's "never graded" signal).
func (r *fakeAssessmentRepo) GetByParticipantStage(ctx context.Context, participantID, sessionSubstageID, tenantID string) (*entity.Assessment, error) {
	for i := range r.rows {
		if r.rows[i].ParticipantID == participantID && r.rows[i].SessionSubstageID == sessionSubstageID {
			row := r.rows[i]
			return &row, nil
		}
	}
	return nil, apperrors.NotFound("not_found", errors.New("assessment not found"))
}

// ListGroupStageProgressByGroup returns the rows owned by groupID.
func (r *fakeSessionRepo) ListGroupStageProgressByGroup(ctx context.Context, groupID string) ([]entity.GroupStageProgress, error) {
	out := make([]entity.GroupStageProgress, 0, len(r.progress))
	for i := range r.progress {
		if r.progress[i].GroupID == groupID {
			out = append(out, r.progress[i])
		}
	}
	return out, nil
}

// UpdateSessionGroup writes the group back to the in-memory fixture.
func (r *fakeSessionRepo) UpdateSessionGroup(ctx context.Context, g *entity.SessionGroup) error {
	row := *g
	r.group = &row
	return nil
}

// completedGateFixture primes group g1 in WAITING with every progress row
// COMPLETED (fasilitator finished all Kegiatan) plus the given participants
// and attendance rows. Scores are added per test.
func completedGateFixture(participants []entity.Participant, attendance []entity.ParticipantAttendance) *fixture {
	f := newFixture()
	f.sessRepo.participants = participants
	f.att.rows = attendance
	f.sessRepo.group = &entity.SessionGroup{
		BaseModel: entity.BaseModel{ID: "g1"},
		SessionID: testSessionID,
		Status:    entity.GroupWaiting,
	}
	f.sessRepo.progress = []entity.GroupStageProgress{
		{GroupID: "g1", SessionSubstageID: "subA1", Status: entity.ProgressCompleted},
		{GroupID: "g1", SessionSubstageID: "subA2", Status: entity.ProgressCompleted},
		{GroupID: "g1", SessionSubstageID: "subB1", Status: entity.ProgressCompleted},
		{GroupID: "g1", SessionSubstageID: "subB2", Status: entity.ProgressCompleted},
	}
	return f
}

// scoreAll records a star>=1 assessment on every Kegiatan for the participant.
func scoreAll(f *fixture, participantID string) {
	for _, id := range []string{"subA1", "subA2", "subB1", "subB2"} {
		f.assess.score(participantID, id)
	}
}

func p(id string) entity.Participant {
	return entity.Participant{BaseModel: entity.BaseModel{ID: id}}
}

func attendance(id, participantID string, isPresent bool) entity.ParticipantAttendance {
	return entity.ParticipantAttendance{
		BaseModel:     entity.BaseModel{ID: id},
		ParticipantID: participantID,
		SessionID:     testSessionID,
		IsPresent:     isPresent,
	}
}

// (a) Every participant marked present and fully graded → group completes.
func TestCheckAndCompleteGroupAllPresentAssessedCompletes(t *testing.T) {
	f := completedGateFixture(
		[]entity.Participant{p("p1")},
		[]entity.ParticipantAttendance{attendance("a1", "p1", true)},
	)
	scoreAll(f, "p1")

	if err := f.badgeUC.CheckAndCompleteGroup(context.Background(), testSessionID, "g1", testTenant); err != nil {
		t.Fatalf("CheckAndCompleteGroup with all present participants graded: %v", err)
	}
	if f.sessRepo.group.Status != entity.GroupCompleted {
		t.Fatalf("group status = %q, want %q", f.sessRepo.group.Status, entity.GroupCompleted)
	}
}

// (b) A participant marked present with a missing score → explicit rejection,
// and the group stays WAITING.
func TestCheckAndCompleteGroupPresentUnassessedRejected(t *testing.T) {
	f := completedGateFixture(
		[]entity.Participant{p("p1")},
		[]entity.ParticipantAttendance{attendance("a1", "p1", true)},
	)
	f.assess.score("p1", "subA1") // subA2/subB1/subB2 stay unscored

	err := f.badgeUC.CheckAndCompleteGroup(context.Background(), testSessionID, "g1", testTenant)
	requireAppErrorCode(t, err, "present_participants_unassessed")
	if f.sessRepo.group.Status != entity.GroupWaiting {
		t.Fatalf("group status = %q, want %q on rejection", f.sessRepo.group.Status, entity.GroupWaiting)
	}
}

// (c) Participants NOT marked present never block: unmarked (belum absen)
// and explicitly absent may stay ungraded while the group completes.
func TestCheckAndCompleteGroupNotAttendingUnassessedCompletes(t *testing.T) {
	f := completedGateFixture(
		[]entity.Participant{p("p1"), p("p2"), p("p3")},
		[]entity.ParticipantAttendance{
			attendance("a1", "p1", true),
			// p2 has no attendance row at all (belum absen);
			attendance("a3", "p3", false), // explicitly absent
		},
	)
	scoreAll(f, "p1") // only the present participant is graded

	if err := f.badgeUC.CheckAndCompleteGroup(context.Background(), testSessionID, "g1", testTenant); err != nil {
		t.Fatalf("CheckAndCompleteGroup must succeed with ungraded non-attending participants: %v", err)
	}
	if f.sessRepo.group.Status != entity.GroupCompleted {
		t.Fatalf("group status = %q, want %q", f.sessRepo.group.Status, entity.GroupCompleted)
	}
}
