package reports_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/usecase/reports"
)

// attendanceRowsFake is a hand-rolled AttendanceRepository for the generate
// absence gate: ListBySession returns the configured rows (or the injected
// error) and records the query scope; the unused methods panic via the
// embedded nil interface.
type attendanceRowsFake struct {
	repository.AttendanceRepository
	rows []entity.ParticipantAttendance
	err  error

	gotSessionID string
	gotTenantID  string
}

func (f *attendanceRowsFake) ListBySession(_ context.Context, sessionID, tenantID string) ([]entity.ParticipantAttendance, error) {
	f.gotSessionID = sessionID
	f.gotTenantID = tenantID
	if f.err != nil {
		return nil, f.err
	}
	return f.rows, nil
}

// newAbsenceFixture wires the generate path with an empty report repo state,
// an immediate (non-blocking) narrative generator and the given attendance
// fake. All other dependencies stay nil — GenerateForSession only reaches
// them through the mission phase, which fails fast with topic_required for
// the fake's topic-less drafts (existing behavior, never fatal to the run).
func newAbsenceFixture(repo *genRepo, att *attendanceRowsFake) *reports.Usecase {
	cfg := &config.Config{ParentReportBaseURL: "http://localhost/parent/report", ReportTokenTTL: 168 * time.Hour}
	return reports.NewUsecase(repo, newBlockingGen(), nil, nil, nil, nil, nil, nil, nil, nil, nil, cfg, nil, nil, att)
}

// reportRowCountByParticipant counts stored report rows per participant.
func reportRowCountByParticipant(repo *genRepo) map[string]int {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	out := make(map[string]int, len(repo.byID))
	for _, r := range repo.byID {
		out[r.ParticipantID]++
	}
	return out
}

// TestGenerateForSessionSkipsAbsentAndKeepsUnmarked: an EXPLICIT
// is_present=false row excludes the participant BEFORE GetOrCreateDraft (no
// report/draft row is ever created for them), while an UNMARKED participant
// (no attendance row) and a present participant both get drafts — unmarked
// must never be treated as absent so sessions without attendance keep working.
func TestGenerateForSessionSkipsAbsentAndKeepsUnmarked(t *testing.T) {
	repo := newGenRepo() // no pre-existing reports
	att := &attendanceRowsFake{rows: []entity.ParticipantAttendance{
		{ParticipantID: "p-a", SessionID: genSessionID, IsPresent: true},
		{ParticipantID: "p-b", SessionID: genSessionID, IsPresent: false},
		// p-c intentionally unmarked: no attendance row at all.
	}}
	uc := newAbsenceFixture(repo, att)

	items, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, newParticipants(3), []string{"stage1"})
	if err != nil {
		t.Fatalf("GenerateForSession returned error: %v", err)
	}

	// The attendance gate must be queried with the run's session + tenant.
	if att.gotSessionID != genSessionID || att.gotTenantID != testTenantID {
		t.Errorf("attendance query scope = (%q, %q), want (%q, %q)",
			att.gotSessionID, att.gotTenantID, genSessionID, testTenantID)
	}

	counts := reportRowCountByParticipant(repo)
	if counts["p-a"] != 1 {
		t.Errorf("present participant p-a report rows = %d, want 1", counts["p-a"])
	}
	if counts["p-c"] != 1 {
		t.Errorf("unmarked participant p-c report rows = %d, want 1", counts["p-c"])
	}
	if n, ok := counts["p-b"]; ok {
		t.Errorf("absent participant p-b must have NO report row, got %d", n)
	}
	for _, r := range items {
		if r.ParticipantID == "p-b" {
			t.Errorf("absent participant p-b must not appear in the returned reports, got %s", r.ID)
		}
	}
}

// TestGenerateForSessionAllTargetsAbsent: when every requested participant is
// explicitly absent the run is rejected with BadRequest("participant_absent")
// before anything is created — no drafts, no generation registry entry.
func TestGenerateForSessionAllTargetsAbsent(t *testing.T) {
	repo := newGenRepo()
	att := &attendanceRowsFake{rows: []entity.ParticipantAttendance{
		{ParticipantID: "p-a", SessionID: genSessionID, IsPresent: false},
		{ParticipantID: "p-b", SessionID: genSessionID, IsPresent: false},
		{ParticipantID: "p-c", SessionID: genSessionID, IsPresent: false},
	}}
	uc := newAbsenceFixture(repo, att)

	_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, newParticipants(3), []string{"stage1"})
	requireAppErrorCode(t, err, "participant_absent")

	if n := len(reportRowCountByParticipant(repo)); n != 0 {
		t.Errorf("no report may be created when every target is absent, got %d rows", n)
	}
	if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
		t.Error("generation registry must stay untouched on participant_absent")
	}
}

// TestGenerateForSessionAttendanceRepoErrorPropagates: an attendance lookup
// failure is returned as-is (never swallowed into a partial/bypassed gate) and
// aborts before any report is created.
func TestGenerateForSessionAttendanceRepoErrorPropagates(t *testing.T) {
	repo := newGenRepo()
	boom := errors.New("attendance down")
	att := &attendanceRowsFake{err: boom}
	uc := newAbsenceFixture(repo, att)

	_, err := uc.GenerateForSession(context.Background(), genSessionID, testTenantID, newParticipants(2), []string{"stage1"})
	if !errors.Is(err, boom) {
		t.Fatalf("attendance repo error must propagate unchanged, got %v", err)
	}
	if n := len(reportRowCountByParticipant(repo)); n != 0 {
		t.Errorf("no report may be created when the attendance lookup fails, got %d rows", n)
	}
	if _, ok := uc.GenerateStatus(genSessionID, testTenantID); ok {
		t.Error("generation registry must stay untouched on an attendance error")
	}
}
