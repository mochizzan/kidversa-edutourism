package reports_test

import (
	"context"
	"testing"
	"time"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/usecase/reports"
)

// ── Fakes for BuildPublicReportView (embedded interfaces panic on unused methods) ──

type viewSessionRepo struct {
	repository.SessionRepository
	participant *entity.Participant
	session     *entity.Session
	stages      []entity.SessionStage
	groups      []entity.SessionGroup
	// groupsBySession, when non-nil, supersedes groups so a lookup against
	// the WRONG session returns a different (wrong) name instead of a lucky
	// match — mirrors per-session session_groups rows.
	groupsBySession map[string][]entity.SessionGroup
	// memberships served by ListSessionMemberships, session-scoped like the
	// production WHERE session_id = ? (tenant intentionally not filtered —
	// that scoping is covered by the repo-level sqlmock tests).
	memberships []entity.ParticipantSessionMembership
}

func (f *viewSessionRepo) GetParticipantByID(ctx context.Context, id, tenantID string) (*entity.Participant, error) {
	return f.participant, nil
}

func (f *viewSessionRepo) GetSessionByID(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	return f.session, nil
}

func (f *viewSessionRepo) ListSessionStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error) {
	return f.stages, nil
}

func (f *viewSessionRepo) ListSessionGroups(ctx context.Context, sessionID string) ([]entity.SessionGroup, error) {
	if f.groupsBySession != nil {
		return f.groupsBySession[sessionID], nil
	}
	return f.groups, nil
}

func (f *viewSessionRepo) ListSessionMemberships(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantSessionMembership, error) {
	out := make([]entity.ParticipantSessionMembership, 0, len(f.memberships))
	for i := range f.memberships {
		if f.memberships[i].SessionID == sessionID {
			out = append(out, f.memberships[i])
		}
	}
	return out, nil
}

type viewProgramRepo struct {
	repository.ProgramRepository
	program *entity.Program
	stages  map[string]*entity.ProgramStage // missing key → NotFound
}

func (f *viewProgramRepo) GetProgramByID(ctx context.Context, id string) (*entity.Program, error) {
	return f.program, nil
}

func (f *viewProgramRepo) GetStageByID(ctx context.Context, id string) (*entity.ProgramStage, error) {
	if s, ok := f.stages[id]; ok {
		return s, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

type viewAssessmentRepo struct {
	repository.AssessmentRepository
	rows       []entity.Assessment // returned in order (created_at DESC, admin ordering)
	lastFilter repository.AssessmentFilter
	pages      int
}

func (f *viewAssessmentRepo) List(ctx context.Context, flt repository.AssessmentFilter, page, limit int) (*repository.Paginated[entity.Assessment], error) {
	f.lastFilter = flt
	f.pages++
	return &repository.Paginated[entity.Assessment]{Items: f.rows, Total: len(f.rows)}, nil
}

type viewMissionRepo struct {
	repository.MissionBankRepository
	candidates   []entity.MissionBank // admin getByTopic order (created_at DESC)
	byID         map[string]entity.MissionBank
	lastFilter   repository.MissionBankFilter
	lastGetIDTen string
}

func (f *viewMissionRepo) List(ctx context.Context, flt repository.MissionBankFilter, page, limit int) (*repository.Paginated[entity.MissionBank], error) {
	f.lastFilter = flt
	return &repository.Paginated[entity.MissionBank]{Items: f.candidates, Total: len(f.candidates)}, nil
}

func (f *viewMissionRepo) GetByID(ctx context.Context, id, tenantID string) (*entity.MissionBank, error) {
	f.lastGetIDTen = tenantID
	if m, ok := f.byID[id]; ok {
		return &m, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

type viewSubstageRepo struct {
	repository.SessionSubstageRepository
	substages []entity.SessionSubstage
	badges    []entity.ParticipantBadge
}

func (f *viewSubstageRepo) ListSessionSubstages(ctx context.Context, sessionID string) ([]entity.SessionSubstage, error) {
	return f.substages, nil
}

func (f *viewSubstageRepo) ListBadgesByParticipant(ctx context.Context, participantID, tenantID string) ([]entity.ParticipantBadge, error) {
	return f.badges, nil
}

type viewProgramSubstageRepo struct {
	repository.ProgramSubstageRepository
	byStage map[string][]entity.ProgramSubstage
}

func (f *viewProgramSubstageRepo) ListSubstages(ctx context.Context, programStageID string) ([]entity.ProgramSubstage, error) {
	return f.byStage[programStageID], nil
}

type viewUserRepo struct {
	repository.UserRepository
	users map[string]entity.User
}

func (f *viewUserRepo) GetByID(ctx context.Context, id string) (*entity.User, error) {
	if u, ok := f.users[id]; ok {
		return &u, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}

// ── Fixture ──

type viewFixture struct {
	uc          *reports.Usecase
	assessments *viewAssessmentRepo
	missions    *viewMissionRepo
	sessRepo    *viewSessionRepo
}

// newViewFixture wires a session with 3 mapped Topik (stage1/stage2/stage3),
// one deleted Topik (skipped), first-wins assessments, and 4 topic missions.
func newViewFixture() *viewFixture {
	tenant := "t-1"
	groupID := "g1"
	facilitatorID := "u1"
	sessID := "s1" // the report's session (newViewReport) — participant is still in it
	ts := time.Date(2026, 9, 19, 10, 0, 0, 0, time.UTC)

	sessRepo := &viewSessionRepo{
		participant: &entity.Participant{
			TenantID:   &tenant,
			SessionID:  &sessID,
			GroupID:    &groupID,
			ChildName:  "Budi Santoso",
			ChildAge:   7,
			SchoolName: "SD Nusantara",
		},
		session: &entity.Session{
			TenantID:    &tenant,
			ProgramID:   "prog1",
			SessionDate: "2026-09-19",
		},
		stages: []entity.SessionStage{
			{BaseModel: entity.BaseModel{ID: "ss1"}, ProgramStageID: "stage1"},
			{BaseModel: entity.BaseModel{ID: "ss2"}, ProgramStageID: "stage2"},
			{BaseModel: entity.BaseModel{ID: "ss4"}, ProgramStageID: "stage3"},
			{BaseModel: entity.BaseModel{ID: "ss3"}, ProgramStageID: "stage-deleted"},
		},
		groups: []entity.SessionGroup{
			{BaseModel: entity.BaseModel{ID: "g1"}, Name: "Kelompok A", FacilitatorID: &facilitatorID},
		},
	}
	progRepo := &viewProgramRepo{
		program: &entity.Program{BaseModel: entity.BaseModel{ID: "prog1"}, Name: "Petualangan Sains"},
		stages: map[string]*entity.ProgramStage{
			"stage1": {BaseModel: entity.BaseModel{ID: "stage1"}, Name: "Topik 1", SequenceOrder: 1},
			"stage2": {BaseModel: entity.BaseModel{ID: "stage2"}, Name: "Topik 2", SequenceOrder: 2},
			"stage3": {BaseModel: entity.BaseModel{ID: "stage3"}, Name: "Topik 3", SequenceOrder: 3},
		},
	}
	// subA/subB share created_at → id tie-break (frontend substagesOfStage).
	sessSubs := &viewSubstageRepo{
		substages: []entity.SessionSubstage{
			{BaseModel: entity.BaseModel{ID: "subC", CreatedAt: ts.Add(time.Hour)}, SessionStageID: "ss2", ProgramSubstageID: "psC"},
			{BaseModel: entity.BaseModel{ID: "subB", CreatedAt: ts}, SessionStageID: "ss1", ProgramSubstageID: "psGone"},
			{BaseModel: entity.BaseModel{ID: "subD", CreatedAt: ts.Add(2 * time.Hour)}, SessionStageID: "ss4", ProgramSubstageID: "psD"},
			{BaseModel: entity.BaseModel{ID: "subA", CreatedAt: ts}, SessionStageID: "ss1", ProgramSubstageID: "psA"},
		},
		badges: []entity.ParticipantBadge{
			{BadgeName: "Bintang Kegiatan", BadgeImageURL: "content-123"},
			{BadgeName: "Tanpa Gambar"},
		},
	}
	progSubs := &viewProgramSubstageRepo{
		byStage: map[string][]entity.ProgramSubstage{
			"stage1": {{BaseModel: entity.BaseModel{ID: "psA"}, Name: "Kegiatan A"}},
			"stage2": {{BaseModel: entity.BaseModel{ID: "psC"}, Name: "Kegiatan C"}},
			"stage3": {{BaseModel: entity.BaseModel{ID: "psD"}, Name: "Kegiatan D"}},
		},
	}
	assessments := &viewAssessmentRepo{
		// created_at DESC (admin ordering): newest subA row first; first wins.
		rows: []entity.Assessment{
			{SessionSubstageID: "subA", StarRating: 4},
			{SessionSubstageID: "subC", StarRating: 1},
			{SessionSubstageID: "subA", StarRating: 2}, // superseded — must NOT win
			{SessionSubstageID: "subD", StarRating: 5},
		},
	}
	missions := &viewMissionRepo{
		// getByTopic order (created_at DESC).
		candidates: []entity.MissionBank{
			{BaseModel: entity.BaseModel{ID: "m4"}, Title: "Misi Empat", RelatedStageIDs: []string{"stage3"}, IsActive: true},
			{BaseModel: entity.BaseModel{ID: "m3"}, Title: "Misi Tiga", RelatedStageIDs: []string{"stage1", "stage2", "stage3"}, IsActive: true},
			{BaseModel: entity.BaseModel{ID: "m2"}, Title: "Misi Dua", RelatedStageIDs: []string{"stage2"}, IsActive: true},
			{BaseModel: entity.BaseModel{ID: "m1"}, Title: "Misi Satu", RelatedStageIDs: []string{"stage1"}, IsActive: true},
		},
		byID: map[string]entity.MissionBank{
			"m9": {BaseModel: entity.BaseModel{ID: "m9"}, Title: "Misi Mandiri", IsActive: true},
		},
	}
	users := &viewUserRepo{users: map[string]entity.User{"u1": {BaseModel: entity.BaseModel{ID: "u1"}, Name: "Bu Sari"}}}

	uc := reports.NewUsecase(nil, nil, nil, missions, assessments, sessRepo, progRepo, nil, progSubs, sessSubs, nil, (*config.Config)(nil), nil, users, nil)
	return &viewFixture{uc: uc, assessments: assessments, missions: missions, sessRepo: sessRepo}
}

func newViewReport() *entity.Report {
	return &entity.Report{
		ParticipantID:  "p1",
		SessionID:      "s1",
		ProgramStageID: "stage1",
		// FacilitatorName empty → exercises the group→user fallback.
	}
}

func missionIDs(ms []reports.PublicMission) []string {
	out := make([]string, 0, len(ms))
	for _, m := range ms {
		out = append(out, m.ID)
	}
	return out
}

func assertStrings(t *testing.T, what string, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %v, want %v", what, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%s = %v, want %v", what, got, want)
		}
	}
}

// TestBuildPublicReportViewMirrorsAdminPreview covers the assembled payload:
// child/program/session fields, live group + facilitator fallback, the
// topic-scoped stage assembly (1 topik = 1 rapor — only the report's own
// Topik reaches LEVEL KEGIATAN), first-wins star ratings, kegiatan name
// fallback, public badge URLs, and the empty mission list when no missions
// are assigned (there is no fallback auto-pick — the frontend hides the
// section). Legacy session-wide rows are pinned separately below.
func TestBuildPublicReportViewMirrorsAdminPreview(t *testing.T) {
	f := newViewFixture()
	view, err := f.uc.BuildPublicReportView(context.Background(), newViewReport())
	if err != nil {
		t.Fatalf("BuildPublicReportView: %v", err)
	}

	if view.ProgramName != "Petualangan Sains" {
		t.Errorf("ProgramName = %q", view.ProgramName)
	}
	if view.TopicName != "Topik 1" {
		t.Errorf("TopicName = %q", view.TopicName)
	}
	if view.ChildName != "Budi Santoso" || view.ChildAge != 7 || view.SchoolName != "SD Nusantara" {
		t.Errorf("child fields = %q/%d/%q", view.ChildName, view.ChildAge, view.SchoolName)
	}
	if view.SessionDate != "2026-09-19T00:00:00Z" {
		t.Errorf("SessionDate = %q, want RFC3339 UTC", view.SessionDate)
	}
	if view.GroupName != "Kelompok A" {
		t.Errorf("GroupName = %q (must resolve live from session_groups)", view.GroupName)
	}
	if view.FacilitatorName != "Bu Sari" {
		t.Errorf("FacilitatorName = %q, want group→user fallback", view.FacilitatorName)
	}

	// 1 topic = 1 rapor: the report row carries stage1, so LEVEL KEGIATAN
	// must expose ONLY that Topik's stage — never the session's others.
	if len(view.Stages) != 1 {
		t.Fatalf("len(Stages) = %d, want 1 (report's Topik only)", len(view.Stages))
	}
	s1 := view.Stages[0]
	if s1.Name != "Topik 1" || s1.SequenceOrder != 1 {
		t.Errorf("stage[0] = %q/%d", s1.Name, s1.SequenceOrder)
	}
	if len(s1.Kegiatan) != 2 {
		t.Fatalf("stage[0] kegiatan = %d, want 2", len(s1.Kegiatan))
	}
	if s1.Kegiatan[0].Name != "Kegiatan A" || s1.Kegiatan[0].StarRating != 4 {
		t.Errorf("kegiatan[0] = %q/%d, want first-wins rating 4", s1.Kegiatan[0].Name, s1.Kegiatan[0].StarRating)
	}
	// Deleted program Kegiatan → raw id, rating 0 (admin fallbacks).
	if s1.Kegiatan[1].Name != "psGone" || s1.Kegiatan[1].StarRating != 0 {
		t.Errorf("kegiatan[1] = %q/%d", s1.Kegiatan[1].Name, s1.Kegiatan[1].StarRating)
	}

	// No assigned missions → empty list (NOT nil, so JSON serializes as []),
	// and NO fallback auto-pick runs even though topic candidates exist.
	if view.Missions == nil {
		t.Fatal("Missions = nil, want empty non-nil slice (JSON [])")
	}
	if len(view.Missions) != 0 {
		t.Errorf("missions = %v, want [] (no fallback selector)", missionIDs(view.Missions))
	}

	if len(view.Badges) != 2 {
		t.Fatalf("len(Badges) = %d, want 2", len(view.Badges))
	}
	if view.Badges[0].BadgeImageURL != "/api/reports/access/badge/content-123" {
		t.Errorf("badge image = %q, want token-scoped badge media route", view.Badges[0].BadgeImageURL)
	}
	if view.Badges[1].BadgeImageURL != "" {
		t.Errorf("badge without image = %q", view.Badges[1].BadgeImageURL)
	}

	// Public reads resolve tenant from the session row (never request context).
	if f.assessments.lastFilter.TenantID != "t-1" ||
		f.assessments.lastFilter.ParticipantID != "p1" ||
		f.assessments.lastFilter.SessionID != "s1" {
		t.Errorf("assessment filter = %+v", f.assessments.lastFilter)
	}
	if f.missions.lastFilter.TenantID != "t-1" || f.missions.lastFilter.TopicID != "stage1" {
		t.Errorf("mission filter = %+v", f.missions.lastFilter)
	}
	if f.missions.lastFilter.IsActive == nil || !*f.missions.lastFilter.IsActive {
		t.Errorf("mission filter must be active-only")
	}
}

// TestBuildPublicReportViewAssignedMissions covers the assigned path: titles
// resolve in admin (candidate) order, and ids the topic page does not carry
// are resolved directly. There is no fallback selector.
func TestBuildPublicReportViewAssignedMissions(t *testing.T) {
	f := newViewFixture()
	r := newViewReport()
	r.MissionIDs = []string{"m1", "m9"} // m9 is not in the topic candidate page

	view, err := f.uc.BuildPublicReportView(context.Background(), r)
	if err != nil {
		t.Fatalf("BuildPublicReportView: %v", err)
	}
	// Candidates arrive [m4,m3,m2,m1] → assigned ∩ candidates = [m1], then the
	// direct lookup appends m9 (there is no fallback selector).
	assertStrings(t, "assigned missions", missionIDs(view.Missions), []string{"m1", "m9"})
	if view.Missions[0].Title != "Misi Satu" || view.Missions[1].Title != "Misi Mandiri" {
		t.Errorf("titles = %q/%q", view.Missions[0].Title, view.Missions[1].Title)
	}
	if f.missions.lastGetIDTen != "t-1" {
		t.Errorf("GetByID tenant = %q, want session tenant", f.missions.lastGetIDTen)
	}
}

// TestBuildPublicReportViewStagesScopedToReportTopic is the regression test
// for the merged LEVEL KEGIATAN bug: every per-topic report row must expose
// ONLY its own Topik's stage. Three topic reports → three distinct payloads,
// never the session's other topics.
func TestBuildPublicReportViewStagesScopedToReportTopic(t *testing.T) {
	cases := []struct {
		topicID  string
		wantName string
		kegiatan string
		rating   int
	}{
		{topicID: "stage2", wantName: "Topik 2", kegiatan: "Kegiatan C", rating: 1},
		{topicID: "stage3", wantName: "Topik 3", kegiatan: "Kegiatan D", rating: 5},
	}
	for _, tc := range cases {
		t.Run(tc.topicID, func(t *testing.T) {
			f := newViewFixture()
			r := newViewReport()
			r.ProgramStageID = tc.topicID

			view, err := f.uc.BuildPublicReportView(context.Background(), r)
			if err != nil {
				t.Fatalf("BuildPublicReportView: %v", err)
			}
			if len(view.Stages) != 1 {
				t.Fatalf("len(Stages) = %d, want 1 (report's Topik only)", len(view.Stages))
			}
			got := view.Stages[0]
			if got.Name != tc.wantName {
				t.Errorf("stage name = %q, want %q", got.Name, tc.wantName)
			}
			if len(got.Kegiatan) != 1 || got.Kegiatan[0].Name != tc.kegiatan || got.Kegiatan[0].StarRating != tc.rating {
				t.Errorf("kegiatan = %+v, want single %q with rating %d", got.Kegiatan, tc.kegiatan, tc.rating)
			}
			if view.TopicName != tc.wantName {
				t.Errorf("TopicName = %q, want %q", view.TopicName, tc.wantName)
			}
		})
	}
}

// TestBuildPublicReportViewLegacyKeepsSessionWideStages pins the legacy
// contract: report rows created before the per-topic split (empty
// ProgramStageID) keep the merged session-wide stages view — session order,
// deleted-Topik skip, and cross-topic ratings intact.
func TestBuildPublicReportViewLegacyKeepsSessionWideStages(t *testing.T) {
	f := newViewFixture()
	r := newViewReport()
	r.ProgramStageID = ""

	view, err := f.uc.BuildPublicReportView(context.Background(), r)
	if err != nil {
		t.Fatalf("BuildPublicReportView: %v", err)
	}
	if view.TopicName != "" {
		t.Errorf("TopicName = %q, want empty for a session-wide legacy row", view.TopicName)
	}
	// Deleted program Topik (ss3) is skipped; the rest keep session order.
	if len(view.Stages) != 3 {
		t.Fatalf("len(Stages) = %d, want 3 (deleted Topik skipped)", len(view.Stages))
	}
	want := []string{"Topik 1", "Topik 2", "Topik 3"}
	for i, name := range want {
		if view.Stages[i].Name != name {
			t.Errorf("stage[%d] = %q, want %q", i, view.Stages[i].Name, name)
		}
	}
	if view.Stages[1].Kegiatan[0].StarRating != 1 {
		t.Errorf("stage[1] rating = %d, want 1", view.Stages[1].Kegiatan[0].StarRating)
	}
	if view.Stages[2].Kegiatan[0].StarRating != 5 {
		t.Errorf("stage[2] rating = %d, want 5", view.Stages[2].Kegiatan[0].StarRating)
	}
}

// ── Group resolution: per-session history contract ──
//
// The mini-rapor kelompok must come from the REPORT'S session, in this order:
//  1. the participant_session_memberships row for (report.ParticipantID,
//     report.SessionID) with a non-empty group_id → live name via
//     ListSessionGroups(report.SessionID);
//  2. else report.group_name (the denormalized per-session name);
//  3. else the participant is still in the report's session with a group
//     pointer → live name ∩ ListSessionGroups(report.SessionID);
//  4. else "" — the global pointer must never leak a name from, or into,
//     another session's historical report.
//
// The fakes serve group lists PER SESSION, so resolving against the wrong
// session yields "Kelompok Kelinci" (or "") instead of a lucky match.

// group builds a session group with an optional facilitator.
func group(id, name, facilitatorID string) entity.SessionGroup {
	g := entity.SessionGroup{BaseModel: entity.BaseModel{ID: id}, Name: name}
	if facilitatorID != "" {
		g.FacilitatorID = &facilitatorID
	}
	return g
}

// moveParticipant points the participant's GLOBAL pointer at another session
// (the state LinkParticipant leaves behind: report rows stay in the source
// session while the pointer names the destination).
func moveParticipant(f *viewFixture, sessionID, groupID string) {
	f.sessRepo.participant.SessionID = &sessionID
	f.sessRepo.participant.GroupID = &groupID
}

// TestBuildPublicReportViewResolvesGroupPerSession is the regression for the
// "same program, different session, same participant" mini-rapor: after
// LinkParticipant moves the participant, the report's session still holds the
// per-session membership row (and the denormalized report.group_name), so
// GroupName must resolve — never the empty "-" render, and never a group name
// borrowed from the participant's current session.
func TestBuildPublicReportViewResolvesGroupPerSession(t *testing.T) {
	// T1 (headline): peserta pindah sesi. Report row in s1, participant
	// pointer now s2/g2, membership (p1, s1) → g1. Must resolve s1's group.
	t.Run("T1_peserta_pindah_sesi_pakai_keanggotaan_sesi_lama", func(t *testing.T) {
		f := newViewFixture()
		moveParticipant(f, "s2", "g2")
		f.sessRepo.groupsBySession = map[string][]entity.SessionGroup{
			"s1": {group("g1", "Kelompok Sapi", "u1")},
			"s2": {group("g2", "Kelompok Kelinci", "u2")},
		}
		g1 := "g1"
		f.sessRepo.memberships = []entity.ParticipantSessionMembership{
			{ParticipantID: "p1", SessionID: "s1", GroupID: &g1},
		}

		view, err := f.uc.BuildPublicReportView(context.Background(), newViewReport())
		if err != nil {
			t.Fatalf("BuildPublicReportView: %v", err)
		}
		if view.GroupName != "Kelompok Sapi" {
			t.Fatalf("GroupName = %q, want %q (membership for the report's session); never %q",
				view.GroupName, "Kelompok Sapi", "Kelompok Kelinci")
		}
	})

	// T2: no membership row, but the report carries the per-session
	// denormalized name — it wins over the participant's foreign pointer.
	t.Run("T2_fallback_ke_report_group_name", func(t *testing.T) {
		f := newViewFixture()
		moveParticipant(f, "s2", "g2")
		f.sessRepo.groupsBySession = map[string][]entity.SessionGroup{
			"s1": {group("g1", "Kelompok Sapi", "u1")},
			"s2": {group("g2", "Kelompok Kelinci", "u2")},
		}

		r := newViewReport()
		r.GroupName = "Kelompok Lama"
		view, err := f.uc.BuildPublicReportView(context.Background(), r)
		if err != nil {
			t.Fatalf("BuildPublicReportView: %v", err)
		}
		if view.GroupName != "Kelompok Lama" {
			t.Fatalf("GroupName = %q, want %q (report.group_name fallback)", view.GroupName, "Kelompok Lama")
		}
	})

	// T3: the happy path is preserved — no membership, no denormalized name,
	// but the participant is still IN the report's session with a group
	// pointer → live intersection resolves as before.
	t.Run("T3_peserta_masih_di_sesi_yang_sama", func(t *testing.T) {
		f := newViewFixture()
		current := "s1"
		f.sessRepo.participant.SessionID = &current // GroupID stays fixture's "g1"
		f.sessRepo.groupsBySession = map[string][]entity.SessionGroup{
			"s1": {group("g1", "Kelompok Sapi", "u1")},
			"s2": {group("g2", "Kelompok Kelinci", "u2")},
		}

		view, err := f.uc.BuildPublicReportView(context.Background(), newViewReport())
		if err != nil {
			t.Fatalf("BuildPublicReportView: %v", err)
		}
		if view.GroupName != "Kelompok Sapi" {
			t.Fatalf("GroupName = %q, want %q (still-in-session pointer path)", view.GroupName, "Kelompok Sapi")
		}
	})

	// T4: no per-session data at all → "". The global pointer (g2, another
	// session) must never leak into this historical report. The decoy
	// membership row belongs to a DIFFERENT participant in the report's
	// session — matching must be keyed on (report.ParticipantID,
	// report.SessionID), so it must be ignored too.
	t.Run("T4_ptr_global_tidak_bocor", func(t *testing.T) {
		f := newViewFixture()
		moveParticipant(f, "s2", "g2")
		f.sessRepo.groupsBySession = map[string][]entity.SessionGroup{
			"s1": {group("g1", "Kelompok Sapi", "u1")},
			"s2": {group("g2", "Kelompok Kelinci", "u2")},
		}
		g1 := "g1"
		f.sessRepo.memberships = []entity.ParticipantSessionMembership{
			{ParticipantID: "other-p", SessionID: "s1", GroupID: &g1},
		}

		view, err := f.uc.BuildPublicReportView(context.Background(), newViewReport())
		if err != nil {
			t.Fatalf("BuildPublicReportView: %v", err)
		}
		if view.GroupName != "" {
			t.Fatalf("GroupName = %q, want \"\" (no data for THIS participant in THIS session)", view.GroupName)
		}
	})

	// T5: the facilitator fallback resolves from the per-session-resolved
	// group (membership → g1 → u1), not from the raw global pointer
	// (g2 → u2 / no match). report.FacilitatorName is empty so the
	// group→user fallback is exercised.
	t.Run("T5_fasilitator_dari_grup_terselesaikan", func(t *testing.T) {
		f := newViewFixture()
		moveParticipant(f, "s2", "g2")
		f.sessRepo.groupsBySession = map[string][]entity.SessionGroup{
			"s1": {group("g1", "Kelompok Sapi", "u1")},
			"s2": {group("g2", "Kelompok Kelinci", "u2")},
		}
		g1 := "g1"
		f.sessRepo.memberships = []entity.ParticipantSessionMembership{
			{ParticipantID: "p1", SessionID: "s1", GroupID: &g1},
		}

		view, err := f.uc.BuildPublicReportView(context.Background(), newViewReport())
		if err != nil {
			t.Fatalf("BuildPublicReportView: %v", err)
		}
		if view.GroupName != "Kelompok Sapi" {
			t.Fatalf("GroupName = %q, want %q (membership path)", view.GroupName, "Kelompok Sapi")
		}
		if view.FacilitatorName != "Bu Sari" {
			t.Fatalf("FacilitatorName = %q, want %q (resolved group g1's facilitator, not the global pointer)",
				view.FacilitatorName, "Bu Sari")
		}
	})
}
