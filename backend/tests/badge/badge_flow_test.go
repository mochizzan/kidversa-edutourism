package badge_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	badgeuc "kidversa-edutourism-backend/internal/usecase/badge"
	"kidversa-edutourism-backend/internal/usecase/reports"
)

// ── Shared fixture constants ──
//
// Program prog1 has two Topik (stageA seq 1, stageB seq 2), two Kegiatan
// each, cloned 1:1 into session s1 (session stages ssA/ssB). One participant
// p1. This mirrors production: a session clones ALL program topics, so the
// set-completion Final trigger is equivalent to "the last topic finished".

const (
	testTenant        = "t-1"
	testProgramID     = "prog1"
	testSessionID     = "s1"
	testParticipantID = "p1"
)

// ── Fakes (stdlib, no DB — embedded interfaces cover unused methods) ──

// badgeStore is an in-memory participant_badges table. It is shared by the
// badge usecase and the reports view so the retroactivity test proves the
// report reads badges live (no per-report snapshot).
type badgeStore struct {
	repository.SessionSubstageRepository
	substages    map[string]entity.SessionSubstage
	order        []string // session substage ids (creation order)
	badges       []entity.ParticipantBadge
	seq          int
	createErrFor string // participant whose CreateBadge write fails
	revokeErr    error  // injected RevokeFinalBadge write failure
}

func stageKey(b *entity.ParticipantBadge) string {
	if b.ProgramStageID == nil {
		return ""
	}
	return *b.ProgramStageID
}

func (s *badgeStore) GetSessionSubstage(ctx context.Context, id string) (*entity.SessionSubstage, error) {
	if sub, ok := s.substages[id]; ok {
		row := sub
		return &row, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (s *badgeStore) ListSessionSubstages(ctx context.Context, sessionID string) ([]entity.SessionSubstage, error) {
	out := make([]entity.SessionSubstage, 0, len(s.order))
	for _, id := range s.order {
		if s.substages[id].SessionID == sessionID {
			out = append(out, s.substages[id])
		}
	}
	return out, nil
}

func (s *badgeStore) UpdateSessionSubstage(ctx context.Context, sub *entity.SessionSubstage) error {
	s.substages[sub.ID] = *sub
	return nil
}

// CreateBadge emulates the DB uniques: uq_participant_subtopik_badge for
// TOPIK rows and one FINAL per (participant, program). createErrFor injects
// a write failure for one participant (best-effort loop tests).
func (s *badgeStore) CreateBadge(ctx context.Context, b *entity.ParticipantBadge) error {
	if s.createErrFor != "" && b.ParticipantID == s.createErrFor {
		return apperrors.Internal("internal_error", errors.New("badge write failed"))
	}
	for i := range s.badges {
		ex := s.badges[i]
		if ex.ParticipantID != b.ParticipantID {
			continue
		}
		if b.BadgeType == entity.BadgeTypeTopik &&
			ex.BadgeType == entity.BadgeTypeTopik && stageKey(&ex) == stageKey(b) {
			return apperrors.Conflict("conflict", nil)
		}
		if b.BadgeType == entity.BadgeTypeFinal &&
			ex.BadgeType == entity.BadgeTypeFinal && ex.ProgramID == b.ProgramID {
			return apperrors.Conflict("conflict", nil)
		}
	}
	s.seq++
	base := time.Date(2026, 9, 19, 10, 0, 0, 0, time.UTC).Add(time.Duration(s.seq) * time.Second)
	b.ID = fmt.Sprintf("badge-%d", s.seq)
	b.CreatedAt = base
	b.UpdatedAt = base
	s.badges = append(s.badges, *b)
	return nil
}

func (s *badgeStore) ListBadgesByParticipant(ctx context.Context, participantID, tenantID string) ([]entity.ParticipantBadge, error) {
	// Signature mirrors the repo; the fixture's badges are always in-tenant so
	// no tenant filtering is applied here.
	out := make([]entity.ParticipantBadge, 0, len(s.badges))
	for i := range s.badges {
		if s.badges[i].ParticipantID == participantID {
			out = append(out, s.badges[i])
		}
	}
	return out, nil
}

func (s *badgeStore) ListBadgesByParticipantStage(ctx context.Context, participantID, programStageID string) ([]entity.ParticipantBadge, error) {
	out := make([]entity.ParticipantBadge, 0, 1)
	for i := range s.badges {
		if s.badges[i].ParticipantID == participantID &&
			s.badges[i].BadgeType == entity.BadgeTypeTopik && stageKey(&s.badges[i]) == programStageID {
			out = append(out, s.badges[i])
		}
	}
	return out, nil
}

func (s *badgeStore) ListFinalBadgesByParticipant(ctx context.Context, participantID, programID string) ([]entity.ParticipantBadge, error) {
	out := make([]entity.ParticipantBadge, 0, 1)
	for i := range s.badges {
		if s.badges[i].ParticipantID == participantID &&
			s.badges[i].BadgeType == entity.BadgeTypeFinal && s.badges[i].ProgramID == programID {
			out = append(out, s.badges[i])
		}
	}
	return out, nil
}

// RevokeFinalBadge emulates the production soft delete: revoked rows leave the
// active list (the fake has no deleted_at — a dropped row behaves exactly like
// a GORM soft-deleted row, invisible to every list query) and TOPIK rows are
// never touched. revokeErr injects a write failure.
func (s *badgeStore) RevokeFinalBadge(ctx context.Context, participantID, programID string) error {
	if s.revokeErr != nil {
		return s.revokeErr
	}
	kept := make([]entity.ParticipantBadge, 0, len(s.badges))
	for i := range s.badges {
		b := s.badges[i]
		if b.ParticipantID == participantID && b.ProgramID == programID && b.BadgeType == entity.BadgeTypeFinal {
			continue
		}
		kept = append(kept, b)
	}
	s.badges = kept
	return nil
}

type fakeProgramRepo struct {
	repository.ProgramRepository
	program *entity.Program
	stages  map[string]*entity.ProgramStage
}

func (r *fakeProgramRepo) GetProgramByID(ctx context.Context, id string) (*entity.Program, error) {
	if r.program != nil && r.program.ID == id {
		return r.program, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeProgramRepo) GetStageByID(ctx context.Context, id string) (*entity.ProgramStage, error) {
	if s, ok := r.stages[id]; ok {
		return s, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeProgramRepo) ListStages(ctx context.Context, programID string) ([]entity.ProgramStage, error) {
	out := make([]entity.ProgramStage, 0, len(r.stages))
	for _, s := range r.stages {
		if s.ProgramID == programID {
			out = append(out, *s)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SequenceOrder < out[j].SequenceOrder })
	return out, nil
}

type fakeProgramSubstageRepo struct {
	repository.ProgramSubstageRepository
	byID    map[string]entity.ProgramSubstage
	byStage map[string][]entity.ProgramSubstage
}

func (r *fakeProgramSubstageRepo) GetSubstageByID(ctx context.Context, id string) (*entity.ProgramSubstage, error) {
	if s, ok := r.byID[id]; ok {
		row := s
		return &row, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeProgramSubstageRepo) ListSubstages(ctx context.Context, programStageID string) ([]entity.ProgramSubstage, error) {
	return r.byStage[programStageID], nil
}

type fakeAssessmentRepo struct {
	repository.AssessmentRepository
	rows    []entity.Assessment
	listErr map[string]error // participantID → error (best-effort tests)
}

// score records a star>=1 assessment (the production trigger evaluates after a
// scored upsert).
func (r *fakeAssessmentRepo) score(participantID, sessionSubstageID string) {
	r.rows = append(r.rows, entity.Assessment{
		ParticipantID:     participantID,
		SessionID:         testSessionID,
		SessionSubstageID: sessionSubstageID,
		StarRating:        3,
	})
}

// Create persists an assessment (the assessment usecase's create path), making
// the row visible to List so the badge evaluation sees the score.
func (r *fakeAssessmentRepo) Create(_ context.Context, a *entity.Assessment) error {
	cp := *a
	r.rows = append(r.rows, cp)
	return nil
}

// GetByParticipantStageIncludingDeleted: the fixture never soft-deletes.
func (r *fakeAssessmentRepo) GetByParticipantStageIncludingDeleted(_ context.Context, _, _, _ string) (*entity.Assessment, error) {
	return nil, apperrors.NotFound("not_found", nil)
}

func (r *fakeAssessmentRepo) List(ctx context.Context, flt repository.AssessmentFilter, page, limit int) (*repository.Paginated[entity.Assessment], error) {
	// Replicates the production repo guard (assessment_repo.go): an empty
	// TenantID is rejected as a required scope.
	if flt.TenantID == "" {
		return nil, apperrors.BadRequest("tenant_required", errors.New("tenant ID is required"))
	}
	if err := r.listErr[flt.ParticipantID]; err != nil {
		return nil, err
	}
	out := make([]entity.Assessment, 0, len(r.rows))
	for i := range r.rows {
		a := r.rows[i]
		if flt.ParticipantID != "" && a.ParticipantID != flt.ParticipantID {
			continue
		}
		if flt.SessionID != "" && a.SessionID != flt.SessionID {
			continue
		}
		if flt.SessionSubstageID != "" && a.SessionSubstageID != flt.SessionSubstageID {
			continue
		}
		if len(flt.SessionSubstageIDs) > 0 && !slices.Contains(flt.SessionSubstageIDs, a.SessionSubstageID) {
			continue
		}
		out = append(out, a)
	}
	return &repository.Paginated[entity.Assessment]{Items: out, Total: len(out)}, nil
}

type fakeSessionRepo struct {
	repository.SessionRepository
	participant  *entity.Participant
	session      *entity.Session
	stages       []entity.SessionStage
	participants []entity.Participant
	group        *entity.SessionGroup
	progress     []entity.GroupStageProgress
}

func (r *fakeSessionRepo) GetSessionGroupByID(ctx context.Context, id, tenantID string) (*entity.SessionGroup, error) {
	if r.group == nil {
		return nil, apperrors.NotFound("not_found", nil)
	}
	return r.group, nil
}

func (r *fakeSessionRepo) GetParticipantByID(ctx context.Context, id, tenantID string) (*entity.Participant, error) {
	return r.participant, nil
}

func (r *fakeSessionRepo) GetSessionByID(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	return r.session, nil
}

func (r *fakeSessionRepo) ListSessionStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error) {
	return r.stages, nil
}

func (r *fakeSessionRepo) ListParticipants(ctx context.Context, sessionID, groupID, tenantID string) ([]entity.Participant, error) {
	return r.participants, nil
}

// GetSessionGroupByParticipant: the fixture's participant belongs to no group,
// so the assessment upsert's group-completion gate is skipped (production
// returns (nil, nil) for a group-less participant).
func (r *fakeSessionRepo) GetSessionGroupByParticipant(ctx context.Context, participantID string) (*entity.SessionGroup, error) {
	return nil, nil
}

type fakeMissionRepo struct {
	repository.MissionBankRepository
}

func (r *fakeMissionRepo) List(ctx context.Context, flt repository.MissionBankFilter, page, limit int) (*repository.Paginated[entity.MissionBank], error) {
	return &repository.Paginated[entity.MissionBank]{Items: []entity.MissionBank{}, Total: 0}, nil
}

// ── Fixture ──

type fixture struct {
	badgeUC  *badgeuc.Usecase
	viewUC   *reports.Usecase
	store    *badgeStore
	assess   *fakeAssessmentRepo
	sessRepo *fakeSessionRepo
	att      *fakeAttendanceRepo
	program  *entity.Program
	stageA   *entity.ProgramStage
	stageB   *entity.ProgramStage
	// Exposed so tests can simulate content changes (a program growing a new
	// Topik) against the SAME repos the usecase holds.
	progRepo *fakeProgramRepo
	progSubs *fakeProgramSubstageRepo
}

func newFixture() *fixture {
	tenant := testTenant
	program := &entity.Program{
		BaseModel:          entity.BaseModel{ID: testProgramID},
		Name:               "Petualangan Sains",
		FinalBadgeName:     "Juara Akhir",
		FinalBadgeImageURL: "final-img",
	}
	stageA := &entity.ProgramStage{
		BaseModel:     entity.BaseModel{ID: "stageA"},
		ProgramID:     testProgramID,
		SequenceOrder: 1,
		Name:          "Topik A",
		BadgeName:     "Ahli Topik A",
		BadgeImageURL: "imgA",
	}
	stageB := &entity.ProgramStage{
		BaseModel:     entity.BaseModel{ID: "stageB"},
		ProgramID:     testProgramID,
		SequenceOrder: 2,
		Name:          "Topik B",
		BadgeName:     "Ahli Topik B",
		BadgeImageURL: "imgB",
	}
	progRepo := &fakeProgramRepo{
		program: program,
		stages:  map[string]*entity.ProgramStage{"stageA": stageA, "stageB": stageB},
	}
	psA1 := entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: "psA1"}, ProgramStageID: "stageA", Name: "Kegiatan A1"}
	psA2 := entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: "psA2"}, ProgramStageID: "stageA", Name: "Kegiatan A2"}
	psB1 := entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: "psB1"}, ProgramStageID: "stageB", Name: "Kegiatan B1"}
	psB2 := entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: "psB2"}, ProgramStageID: "stageB", Name: "Kegiatan B2"}
	progSubs := &fakeProgramSubstageRepo{
		byID: map[string]entity.ProgramSubstage{
			"psA1": psA1, "psA2": psA2, "psB1": psB1, "psB2": psB2,
		},
		byStage: map[string][]entity.ProgramSubstage{
			"stageA": {psA1, psA2},
			"stageB": {psB1, psB2},
		},
	}
	store := &badgeStore{
		substages: map[string]entity.SessionSubstage{
			"subA1": {BaseModel: entity.BaseModel{ID: "subA1"}, SessionID: testSessionID, SessionStageID: "ssA", ProgramSubstageID: "psA1"},
			"subA2": {BaseModel: entity.BaseModel{ID: "subA2"}, SessionID: testSessionID, SessionStageID: "ssA", ProgramSubstageID: "psA2"},
			"subB1": {BaseModel: entity.BaseModel{ID: "subB1"}, SessionID: testSessionID, SessionStageID: "ssB", ProgramSubstageID: "psB1"},
			"subB2": {BaseModel: entity.BaseModel{ID: "subB2"}, SessionID: testSessionID, SessionStageID: "ssB", ProgramSubstageID: "psB2"},
		},
		order: []string{"subA1", "subA2", "subB1", "subB2"},
	}
	assess := &fakeAssessmentRepo{listErr: map[string]error{}}
	sessID := testSessionID
	sessRepo := &fakeSessionRepo{
		participant: &entity.Participant{TenantID: &tenant, SessionID: &sessID, ChildName: "Budi Santoso", ChildAge: 7},
		session: &entity.Session{
			BaseModel:   entity.BaseModel{ID: testSessionID},
			TenantID:    &tenant,
			ProgramID:   testProgramID,
			SessionDate: "2026-09-19",
		},
		stages: []entity.SessionStage{
			{BaseModel: entity.BaseModel{ID: "ssA"}, SessionID: testSessionID, ProgramStageID: "stageA"},
			{BaseModel: entity.BaseModel{ID: "ssB"}, SessionID: testSessionID, ProgramStageID: "stageB"},
		},
		participants: []entity.Participant{
			{BaseModel: entity.BaseModel{ID: "p1"}},
		},
	}

	att := &fakeAttendanceRepo{}
	badgeUC := badgeuc.NewUsecase(store, progSubs, progRepo, assess, sessRepo, att)
	viewUC := reports.NewUsecase(nil, nil, nil, &fakeMissionRepo{}, assess, sessRepo, progRepo, nil, progSubs, store, nil, (*config.Config)(nil), nil, nil, nil)

	return &fixture{
		badgeUC:  badgeUC,
		viewUC:   viewUC,
		store:    store,
		assess:   assess,
		sessRepo: sessRepo,
		att:      att,
		program:  program,
		stageA:   stageA,
		stageB:   stageB,
		progRepo: progRepo,
		progSubs: progSubs,
	}
}

// completeTopic scores (star>=1) and evaluates each session Kegiatan in order,
// exactly like the assessment upsert trigger does.
func (f *fixture) completeTopic(t *testing.T, substageIDs ...string) {
	t.Helper()
	ctx := context.Background()
	for _, id := range substageIDs {
		f.assess.score(testParticipantID, id)
		if err := f.badgeUC.EvaluateAfterAssessment(ctx, testParticipantID, id, testTenant); err != nil {
			t.Fatalf("EvaluateAfterAssessment(%s): %v", id, err)
		}
	}
}

func (f *fixture) badges(t *testing.T) []entity.ParticipantBadge {
	t.Helper()
	rows, err := f.store.ListBadgesByParticipant(context.Background(), testParticipantID, testTenant)
	if err != nil {
		t.Fatalf("ListBadgesByParticipant: %v", err)
	}
	return rows
}

type wantBadge struct {
	badgeType string
	stageID   string // "" → ProgramStageID must be nil (FINAL)
	name      string
}

func assertBadges(t *testing.T, rows []entity.ParticipantBadge, want []wantBadge) {
	t.Helper()
	if len(rows) != len(want) {
		t.Fatalf("badge rows = %d, want %d (%+v)", len(rows), len(want), rows)
	}
	for i, w := range want {
		got := rows[i]
		if got.ParticipantID != testParticipantID {
			t.Errorf("badge[%d].ParticipantID = %q", i, got.ParticipantID)
		}
		if got.BadgeType != w.badgeType {
			t.Errorf("badge[%d].BadgeType = %q, want %q", i, got.BadgeType, w.badgeType)
		}
		if w.stageID == "" {
			if got.ProgramStageID != nil {
				t.Errorf("badge[%d].ProgramStageID = %q, want nil (FINAL carries no Topik)", i, *got.ProgramStageID)
			}
		} else if got.ProgramStageID == nil || *got.ProgramStageID != w.stageID {
			t.Errorf("badge[%d].ProgramStageID = %v, want %q", i, got.ProgramStageID, w.stageID)
		}
		if got.BadgeName != w.name {
			t.Errorf("badge[%d].BadgeName = %q, want %q", i, got.BadgeName, w.name)
		}
	}
}

// captureLogs routes the standard logger (log.Printf) into a buffer for the
// duration of the test.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	return &buf
}

// ── 1. Core 2-Topik scenario: equivalence of set-completion and "last topic" ──

func TestBadgeFlowTwoTopicsLastTopicAwardsFinal(t *testing.T) {
	f := newFixture()

	// Topik A, first Kegiatan scored → no badge yet (not all scored).
	f.completeTopic(t, "subA1")
	assertBadges(t, f.badges(t), nil)

	// Topik A complete → TOPIK A only; FINAL must NOT exist yet.
	f.completeTopic(t, "subA2")
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeTopik, stageID: "stageA", name: "Ahli Topik A"},
	})

	// Topik B, first Kegiatan scored → still only badge A.
	f.completeTopic(t, "subB1")
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeTopik, stageID: "stageA", name: "Ahli Topik A"},
	})

	// Topik B (the last topic of the 1:1 cloned session) complete →
	// TOPIK B + FINAL appear together: set-completion == "last topic done".
	f.completeTopic(t, "subB2")
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeTopik, stageID: "stageA", name: "Ahli Topik A"},
		{badgeType: entity.BadgeTypeTopik, stageID: "stageB", name: "Ahli Topik B"},
		{badgeType: entity.BadgeTypeFinal, stageID: "", name: "Juara Akhir"},
	})
}

// Order independence: the Final badge is set-completion, not positional — it
// appears exactly when the LAST missing topic badge lands, whichever topic
// that is.
func TestBadgeFlowFinalFollowsLastCompletedTopic(t *testing.T) {
	f := newFixture()

	// Topic B (sequence 2) completes FIRST → no FINAL (Topik A still missing).
	f.completeTopic(t, "subB1", "subB2")
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeTopik, stageID: "stageB", name: "Ahli Topik B"},
	})

	// Topic A completes → the set is complete → FINAL.
	f.completeTopic(t, "subA1", "subA2")
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeTopik, stageID: "stageB", name: "Ahli Topik B"},
		{badgeType: entity.BadgeTypeTopik, stageID: "stageA", name: "Ahli Topik A"},
		{badgeType: entity.BadgeTypeFinal, stageID: "", name: "Juara Akhir"},
	})
}

// ── 4. Idempotency: re-evaluating never duplicates rows ──

func TestBadgeFlowEvaluateIsIdempotent(t *testing.T) {
	f := newFixture()
	f.completeTopic(t, "subA1", "subA2", "subB1", "subB2")
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeTopik, stageID: "stageA", name: "Ahli Topik A"},
		{badgeType: entity.BadgeTypeTopik, stageID: "stageB", name: "Ahli Topik B"},
		{badgeType: entity.BadgeTypeFinal, stageID: "", name: "Juara Akhir"},
	})

	// Evaluate a second time (both topics) → still exactly 3 rows.
	ctx := context.Background()
	for _, id := range []string{"subA2", "subB2"} {
		if err := f.badgeUC.EvaluateAfterAssessment(ctx, testParticipantID, id, testTenant); err != nil {
			t.Fatalf("second EvaluateAfterAssessment(%s): %v", id, err)
		}
	}
	// Direct Final recompute is also a no-op when the row exists.
	if _, err := f.badgeUC.RecomputeFinalBadge(ctx, testParticipantID, testProgramID); err != nil {
		t.Fatalf("RecomputeFinalBadge: %v", err)
	}
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeTopik, stageID: "stageA", name: "Ahli Topik A"},
		{badgeType: entity.BadgeTypeTopik, stageID: "stageB", name: "Ahli Topik B"},
		{badgeType: entity.BadgeTypeFinal, stageID: "", name: "Juara Akhir"},
	})
}

// ── 2. Retroactivity: the report view reads badges live, no per-report snapshot ──

func TestBadgeFlowRetroactivePublicView(t *testing.T) {
	f := newFixture()
	ctx := context.Background()
	report := &entity.Report{ParticipantID: testParticipantID, SessionID: testSessionID, ProgramStageID: "stageA"}

	// Only Topik A earned → the Topik A report shows 1 badge, no FINAL.
	f.completeTopic(t, "subA1", "subA2")
	before, err := f.viewUC.BuildPublicReportView(ctx, report)
	if err != nil {
		t.Fatalf("BuildPublicReportView (before FINAL): %v", err)
	}
	if len(before.Badges) != 1 || before.Badges[0].BadgeType != entity.BadgeTypeTopik {
		t.Fatalf("before FINAL: badges = %+v, want 1 TOPIK", before.Badges)
	}

	// Topik B completes → the FINAL row exists now.
	f.completeTopic(t, "subB1", "subB2")

	// SAME report rebuilt → the FINAL badge is included: live read, nothing
	// was stored on the report when it was first rendered.
	after, err := f.viewUC.BuildPublicReportView(ctx, report)
	if err != nil {
		t.Fatalf("BuildPublicReportView (after FINAL): %v", err)
	}
	if len(after.Badges) != 3 {
		t.Fatalf("after FINAL: badge count = %d, want 3 (%+v)", len(after.Badges), after.Badges)
	}
	last := after.Badges[2]
	if last.BadgeType != entity.BadgeTypeFinal || last.ProgramStageID != "" || last.BadgeName != "Juara Akhir" {
		t.Errorf("FINAL badge in view = %+v", last)
	}
	if last.BadgeImageURL != "/api/reports/access/badge/final-img" {
		t.Errorf("FINAL badge image = %q, want token-scoped badge media route", last.BadgeImageURL)
	}
	// Topic badges carry their Topik for the client-side split.
	if after.Badges[0].BadgeType != entity.BadgeTypeTopik || after.Badges[0].ProgramStageID != "stageA" {
		t.Errorf("badge[0] = %+v, want TOPIK/stageA", after.Badges[0])
	}

	// D2 contract fields survive JSON: every badge item exposes badge_type and
	// program_stage_id; the report DTO exposes program_stage_id.
	rawBadges, err := json.Marshal(after.Badges)
	if err != nil {
		t.Fatalf("marshal badges: %v", err)
	}
	var wireBadges []map[string]interface{}
	if err := json.Unmarshal(rawBadges, &wireBadges); err != nil {
		t.Fatalf("unmarshal badges: %v", err)
	}
	for i, item := range wireBadges {
		if _, ok := item["badge_type"]; !ok {
			t.Errorf("badge[%d] JSON missing badge_type: %v", i, item)
		}
		if _, ok := item["program_stage_id"]; !ok {
			t.Errorf("badge[%d] JSON missing program_stage_id: %v", i, item)
		}
	}
	if wireBadges[2]["badge_type"] != entity.BadgeTypeFinal || wireBadges[2]["program_stage_id"] != "" {
		t.Errorf("FINAL badge JSON = %v", wireBadges[2])
	}

	rawDTO, err := json.Marshal(dto.NewPublicReportDTO(report, after, ""))
	if err != nil {
		t.Fatalf("marshal PublicReportDTO: %v", err)
	}
	var wireDTO map[string]interface{}
	if err := json.Unmarshal(rawDTO, &wireDTO); err != nil {
		t.Fatalf("unmarshal PublicReportDTO: %v", err)
	}
	if wireDTO["program_stage_id"] != "stageA" {
		t.Errorf("report JSON program_stage_id = %v, want stageA", wireDTO["program_stage_id"])
	}
	dtoBadges, ok := wireDTO["badges"].([]interface{})
	if !ok || len(dtoBadges) != 3 {
		t.Fatalf("report JSON badges = %v, want 3-item array", wireDTO["badges"])
	}
}

// ── 3. Empty name templates → no row, no error, info log ──

func TestBadgeFlowEmptyNameTemplateSkipsAward(t *testing.T) {
	buf := captureLogs(t)

	t.Run("topik_tanpa_badge_name", func(t *testing.T) {
		f := newFixture()
		f.stageA.BadgeName = ""

		// Topik A complete → skipped (no row, no error).
		f.completeTopic(t, "subA1", "subA2")
		if rows := f.badges(t); len(rows) != 0 {
			t.Fatalf("badges with empty badge_name = %+v, want none", rows)
		}

		// Topik B complete → only its own badge; FINAL stays unreachable
		// because Topik A never earned a badge (set-completion unmet).
		f.completeTopic(t, "subB1", "subB2")
		assertBadges(t, f.badges(t), []wantBadge{
			{badgeType: entity.BadgeTypeTopik, stageID: "stageB", name: "Ahli Topik B"},
		})
	})

	t.Run("program_tanpa_final_badge_name", func(t *testing.T) {
		f := newFixture()
		f.program.FinalBadgeName = ""

		f.completeTopic(t, "subA1", "subA2", "subB1", "subB2")
		assertBadges(t, f.badges(t), []wantBadge{
			{badgeType: entity.BadgeTypeTopik, stageID: "stageA", name: "Ahli Topik A"},
			{badgeType: entity.BadgeTypeTopik, stageID: "stageB", name: "Ahli Topik B"},
		})
	})

	out := buf.String()
	if !strings.Contains(out, "badge: skip TOPIK award participant=p1 stage=stageA: program_stages.badge_name is empty") {
		t.Errorf("missing TOPIK skip log, got:\n%s", out)
	}
	if !strings.Contains(out, "badge: skip FINAL award participant=p1 program=prog1: programs.final_badge_name is empty") {
		t.Errorf("missing FINAL skip log, got:\n%s", out)
	}
}

// requireAppErrorCode asserts err is an app error carrying want (hand-rolled,
// repo convention — no testify).
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

// ── D1-3: live-monitor completion keeps going past a failing participant,
// never swallows the error silently, AND surfaces an explicit aggregate error
// (no more silent 204 on total failure) ──

func TestCompleteSessionSubstageLogsAndContinues(t *testing.T) {
	buf := captureLogs(t)
	f := newFixture()
	f.sessRepo.participants = []entity.Participant{
		{BaseModel: entity.BaseModel{ID: "p1"}},
		{BaseModel: entity.BaseModel{ID: "p2"}},
	}
	// p1's badge write fails; p2 is fully scored and clean.
	f.store.createErrFor = "p1"
	for _, id := range []string{"subA1", "subA2", "subB1", "subB2"} {
		f.assess.score("p1", id)
		f.assess.score("p2", id)
	}
	// p2 already earned Topik A through the normal assessment path.
	if err := f.badgeUC.EvaluateAfterAssessment(context.Background(), "p2", "subA1", testTenant); err != nil {
		t.Fatalf("pre-evaluate p2 Topik A: %v", err)
	}

	// NEW contract: the loop still continues past the failing participant, but
	// the failures are aggregated into an explicit returned error.
	err := f.badgeUC.CompleteSessionSubstage(context.Background(), "subB2", testTenant)
	if err == nil {
		t.Fatal("CompleteSessionSubstage must return an explicit error when a participant evaluation fails, got nil")
	}
	if !strings.Contains(err.Error(), "participant p1") || !strings.Contains(err.Error(), "badge write failed") {
		t.Errorf("error must aggregate failing participants with cause, got: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "badge: evaluate after session-substage subB2 failed for participant p1") ||
		!strings.Contains(out, "badge write failed") {
		t.Errorf("missing best-effort evaluation log, got:\n%s", out)
	}

	// p1 errored → no badges; p2 still got all three (loop continued).
	p1Rows, err2 := f.store.ListBadgesByParticipant(context.Background(), "p1", testTenant)
	if err2 != nil || len(p1Rows) != 0 {
		t.Errorf("p1 badges = %+v (err %v), want none", p1Rows, err2)
	}
	p2Rows, err2 := f.store.ListBadgesByParticipant(context.Background(), "p2", testTenant)
	if err2 != nil || len(p2Rows) != 3 {
		t.Fatalf("p2 badges = %d (err %v), want 3 (loop continued)", len(p2Rows), err2)
	}

	// The completion itself was persisted.
	sub, err2 := f.store.GetSessionSubstage(context.Background(), "subB2")
	if err2 != nil || sub.Status != entity.SessionSubstageCompleted {
		t.Errorf("subB2 status = %v (err %v), want COMPLETED", sub.Status, err2)
	}
}

// ── D1-4 regression: a failing assessment lookup during evaluation surfaces
// as an EXPLICIT error — never silently treated as unscored ──

func TestEvaluateAfterAssessmentReturnsAssessmentListError(t *testing.T) {
	f := newFixture()
	f.assess.listErr[testParticipantID] = errors.New("assessment db down")
	for _, id := range []string{"subA1", "subA2", "subB1", "subB2"} {
		f.assess.score(testParticipantID, id)
	}

	err := f.badgeUC.EvaluateAfterAssessment(context.Background(), testParticipantID, "subB2", testTenant)
	if err == nil {
		t.Fatal("evaluation must return an explicit error on a lookup failure, got nil")
	}
	if !strings.Contains(err.Error(), "assessment db down") ||
		!strings.Contains(err.Error(), "participant=p1") ||
		!strings.Contains(err.Error(), "substages=[subB1 subB2]") {
		t.Errorf("error must carry participant/substage-list context, got: %v", err)
	}
	if rows := f.badges(t); len(rows) != 0 {
		t.Fatalf("badges = %+v, want none (no award on error)", rows)
	}
}

// ── Empty tenant at the evaluation boundary → explicit tenant_required ──

func TestEvaluateAfterAssessmentEmptyTenantReturnsTenantRequired(t *testing.T) {
	f := newFixture()
	f.assess.score(testParticipantID, "subA1")

	err := f.badgeUC.EvaluateAfterAssessment(context.Background(), testParticipantID, "subA1", "")
	requireAppErrorCode(t, err, "tenant_required")
	if rows := f.badges(t); len(rows) != 0 {
		t.Fatalf("badges = %+v, want none", rows)
	}
}

// ── Backfill: an already-COMPLETED group heals missing badges from existing
// scores (no new scoring event) and is idempotent on re-run ──

func TestCheckAndCompleteGroupBackfillsMissingBadges(t *testing.T) {
	f := newFixture()
	// Fully scored but ZERO badge rows (evaluation previously failed/was skipped).
	for _, id := range []string{"subA1", "subA2", "subB1", "subB2"} {
		f.assess.score(testParticipantID, id)
	}
	if rows := f.badges(t); len(rows) != 0 {
		t.Fatalf("precondition: badges = %+v, want none", rows)
	}
	f.sessRepo.group = &entity.SessionGroup{
		BaseModel: entity.BaseModel{ID: "g1"},
		SessionID: testSessionID,
		Status:    entity.GroupCompleted,
	}

	ctx := context.Background()
	// Heal path (already-COMPLETED): backfill runs before the early return.
	if err := f.badgeUC.CheckAndCompleteGroup(ctx, testSessionID, "g1", testTenant); err != nil {
		t.Fatalf("CheckAndCompleteGroup heal path: %v", err)
	}
	want := []wantBadge{
		{badgeType: entity.BadgeTypeTopik, stageID: "stageA", name: "Ahli Topik A"},
		{badgeType: entity.BadgeTypeTopik, stageID: "stageB", name: "Ahli Topik B"},
		{badgeType: entity.BadgeTypeFinal, stageID: "", name: "Juara Akhir"},
	}
	assertBadges(t, f.badges(t), want)

	// Second run: idempotent, no duplicates.
	if err := f.badgeUC.CheckAndCompleteGroup(ctx, testSessionID, "g1", testTenant); err != nil {
		t.Fatalf("second CheckAndCompleteGroup: %v", err)
	}
	assertBadges(t, f.badges(t), want)
}

// ── D2-1: GET /api/badges items always carry program_stage_id ("" for FINAL) ──

func TestBadgeListHandlerAlwaysSerializesProgramStageID(t *testing.T) {
	f := newFixture()
	f.completeTopic(t, "subA1", "subA2", "subB1", "subB2")

	h := handler.NewBadgeHandler(f.store)
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/badges?participant_id=p1", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	if err := h.List(c); err != nil {
		t.Fatalf("BadgeHandler.List: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var env struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(env.Data) != 3 {
		t.Fatalf("items = %d, want 3", len(env.Data))
	}
	wantStages := []string{"stageA", "stageB", ""}
	wantTypes := []string{entity.BadgeTypeTopik, entity.BadgeTypeTopik, entity.BadgeTypeFinal}
	for i, item := range env.Data {
		raw, ok := item["program_stage_id"]
		if !ok {
			t.Fatalf("item[%d] missing program_stage_id: %v", i, item)
		}
		if got, _ := raw.(string); got != wantStages[i] {
			t.Errorf("item[%d].program_stage_id = %v, want %q", i, raw, wantStages[i])
		}
		if item["badge_type"] != wantTypes[i] {
			t.Errorf("item[%d].badge_type = %v, want %q", i, item["badge_type"], wantTypes[i])
		}
	}
}

// ── D5-8/h: a participant with no badges still produces a badges JSON array
// ("[]", never null) in the public report DTO, so clients can iterate or split
// without a null guard. ──

func TestBadgeFlowEmptyBadgesSerializeAsEmptyArray(t *testing.T) {
	f := newFixture()
	ctx := context.Background()
	report := &entity.Report{ParticipantID: testParticipantID, SessionID: testSessionID, ProgramStageID: "stageA"}

	view, err := f.viewUC.BuildPublicReportView(ctx, report)
	if err != nil {
		t.Fatalf("BuildPublicReportView: %v", err)
	}
	if view.Badges == nil {
		t.Fatal("view.Badges is nil, want a non-nil empty slice")
	}
	if len(view.Badges) != 0 {
		t.Fatalf("badge rows = %d, want 0 (nothing awarded yet)", len(view.Badges))
	}

	raw, err := json.Marshal(dto.NewPublicReportDTO(report, view, ""))
	if err != nil {
		t.Fatalf("marshal PublicReportDTO: %v", err)
	}
	if !strings.Contains(string(raw), `"badges":[]`) {
		t.Errorf("report JSON badges must serialize as [], got: %s", raw)
	}
	var wire map[string]interface{}
	if err := json.Unmarshal(raw, &wire); err != nil {
		t.Fatalf("unmarshal PublicReportDTO: %v", err)
	}
	if got, ok := wire["badges"].([]interface{}); !ok || len(got) != 0 {
		t.Errorf("report JSON badges = %#v, want empty array (not null)", wire["badges"])
	}
}
