package auth_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// ---------------------------------------------------------------------------
// Report clone tests (S3): LinkParticipant must COPY — never move — the
// participant's reports (rapor) + participant_missions from the source session
// to the target session of a same-program migration, with a FRESH parent token
// per copy, sent_at cleared (undelivered → re-sendable) and gallery tokens
// reset. Hand-rolled fakes only, no DB; the link-migration fixture from
// participant_session_gate_test.go provides the session/assessment/attendance
// fakes and the badge reconcile hook.
// ---------------------------------------------------------------------------

// fakeCloneReportRepo is an in-memory ReportRepository covering the clone
// path. List filters by participant+session (recording every filter for scope
// assertions) and hides tombstoned rows; Create enforces the
// (session_id, participant_id, program_stage_id) unique — INCLUDING tombstones,
// mirroring the physical uq_reports_session_participant_topic index — and
// denormalizes an empty GroupName from the participant's group, exactly like
// GormReportRepository.Create. Unused interface methods panic through the
// embedded nil interface.
type fakeCloneReportRepo struct {
	repository.ReportRepository
	rows      []entity.Report
	hidden    map[string]bool // tombstone row IDs: hidden from List, still hold the unique slot
	groupName string          // group name Create denormalizes for the fixture participant
	listErr   error
	createErr error
	listCalls []repository.ReportFilter
	created   []*entity.Report
	seq       int
}

func (r *fakeCloneReportRepo) List(_ context.Context, f repository.ReportFilter, _, _ int) (*repository.Paginated[entity.Report], error) {
	r.listCalls = append(r.listCalls, f)
	if r.listErr != nil {
		return nil, r.listErr
	}
	var items []entity.Report
	for i := range r.rows {
		row := r.rows[i]
		if r.hidden[row.ID] {
			continue // soft-deleted: invisible to List, physical slot still held
		}
		if row.ParticipantID == f.ParticipantID && row.SessionID == f.SessionID {
			items = append(items, row)
		}
	}
	return &repository.Paginated[entity.Report]{Items: items, Total: len(items)}, nil
}

func (r *fakeCloneReportRepo) Create(_ context.Context, rep *entity.Report) error {
	if r.createErr != nil {
		return r.createErr
	}
	// Physical unique: tombstones participate (same as the real index).
	for i := range r.rows {
		ex := r.rows[i]
		if ex.SessionID == rep.SessionID && ex.ParticipantID == rep.ParticipantID && ex.ProgramStageID == rep.ProgramStageID {
			return apperrors.Conflict("conflict", nil)
		}
	}
	r.seq++
	rep.ID = fmt.Sprintf("rep-c%d", r.seq) // BeforeCreate-equivalent: fresh PK
	if rep.GroupName == "" {
		rep.GroupName = r.groupName // denormalize like GormReportRepository.Create
	}
	cp := *rep
	r.rows = append(r.rows, cp)
	r.created = append(r.created, &cp)
	return nil
}

// cloneReportsIn returns the fake's VISIBLE rows of one session (assertion helper).
func cloneReportsIn(r *fakeCloneReportRepo, sessionID string) []entity.Report {
	var out []entity.Report
	for i := range r.rows {
		if r.rows[i].SessionID == sessionID && !r.hidden[r.rows[i].ID] {
			out = append(out, r.rows[i])
		}
	}
	return out
}

// reportByStage finds one report of a session by its program_stage key
// ("" = legacy whole-session row). Returns nil when absent.
func reportByStage(rows []entity.Report, programStageID string) *entity.Report {
	for i := range rows {
		if rows[i].ProgramStageID == programStageID {
			return &rows[i]
		}
	}
	return nil
}

// missionRepoCall records one fake ParticipantMissionRepository call.
type missionRepoCall struct {
	tenantID string
	reportID string
}

// fakeCloneMissionRepo stores participant_missions keyed by report ID.
// GetByReport returns the stored rows; ReplaceByReport records the RAW items
// it was given (so tests can assert fresh IDs) and atomically replaces the
// rows — delete + insert, like the production transaction.
type fakeCloneMissionRepo struct {
	repository.ParticipantMissionRepository
	rows         map[string][]entity.ParticipantMission
	getErr       error
	replaceErr   error
	getCalls     []missionRepoCall
	replaceCalls []missionRepoCall
	replaced     map[string][]entity.ParticipantMission // raw items per report ID
}

func (r *fakeCloneMissionRepo) GetByReport(_ context.Context, tenantID, reportID string) ([]entity.ParticipantMission, error) {
	r.getCalls = append(r.getCalls, missionRepoCall{tenantID: tenantID, reportID: reportID})
	if r.getErr != nil {
		return nil, r.getErr
	}
	return append([]entity.ParticipantMission(nil), r.rows[reportID]...), nil
}

func (r *fakeCloneMissionRepo) ReplaceByReport(_ context.Context, tenantID, reportID string, items []entity.ParticipantMission) error {
	r.replaceCalls = append(r.replaceCalls, missionRepoCall{tenantID: tenantID, reportID: reportID})
	if r.replaceErr != nil {
		return r.replaceErr
	}
	if r.replaced == nil {
		r.replaced = make(map[string][]entity.ParticipantMission)
	}
	r.replaced[reportID] = append([]entity.ParticipantMission(nil), items...)
	r.rows[reportID] = append([]entity.ParticipantMission(nil), items...)
	return nil
}

// reportCloneFixture extends the link-migration fixture with the report +
// participant-mission clone deps and seeded SOURCE-session reports: two
// per-Topic rows (stage-1 approved + delivered, stage-2 draft) and one legacy
// whole-session row (empty program_stage_id). The stage-1 row carries the
// delivery/token state the clone must NOT inherit (sent parent token with
// expiry, revoked gallery token, source group name); it also owns two
// participant_missions (one completed, one pending).
type reportCloneFixture struct {
	*linkMigrationFixture
	rpt *fakeCloneReportRepo
	mis *fakeCloneMissionRepo
}

func newReportCloneFixture(targetProgram, srcProgram string) *reportCloneFixture {
	f := newLinkMigrationFixture(targetProgram, srcProgram)

	approver := "usr-approver"

	rpt := &fakeCloneReportRepo{
		groupName: "Kelompok Tujuan",
		hidden:    map[string]bool{},
		rows: []entity.Report{
			{
				BaseModel:        entity.BaseModel{ID: "rep-src-1"},
				ParticipantID:    "pid-1",
				SessionID:        "sess-src",
				ProgramStageID:   "stage-1",
				AINarrativeDraft: "draft narasi satu",
				AINarrativeFinal: "final narasi satu",
				ReportPDFURL:     "pdf/rapor-1.pdf",
				Status:           entity.ReportApproved,
				GeneratedAt:      &genAtFixed,
				ApprovedBy:       &approver,
				SentAt:           &sentAtFixed,
				// Delivered state: fresh token defaults must replace ALL of this.
				ParentAccessToken:     "parent-token-src-1",
				ParentTokenExpiresAt:  &expAtFixed,
				ParentTokenRevoked:    false,
				GalleryAccessToken:    "gallery-token-src-1",
				GalleryTokenExpiresAt: &expAtFixed,
				GalleryTokenRevoked:   true,
				GroupName:             "Kelompok Sumber",
			},
			{
				BaseModel:         entity.BaseModel{ID: "rep-src-2"},
				ParticipantID:     "pid-1",
				SessionID:         "sess-src",
				ProgramStageID:    "stage-2",
				AINarrativeDraft:  "draft narasi dua",
				Status:            entity.ReportDraft,
				ParentAccessToken: "parent-token-src-2",
				GroupName:         "Kelompok Sumber",
			},
			{
				BaseModel:         entity.BaseModel{ID: "rep-src-legacy"},
				ParticipantID:     "pid-1",
				SessionID:         "sess-src",
				ProgramStageID:    "", // legacy whole-session report
				AINarrativeFinal:  "final seluruh sesi",
				Status:            entity.ReportSent,
				ParentAccessToken: "parent-token-src-legacy",
				SentAt:            &sentAtFixed,
				GroupName:         "Kelompok Sumber",
			},
		},
	}
	mis := &fakeCloneMissionRepo{
		rows: map[string][]entity.ParticipantMission{
			"rep-src-1": {
				{BaseModel: entity.BaseModel{ID: "pm-1"}, ReportID: "rep-src-1", MissionBankID: "mb-1", IsCompleted: true, CompletedAt: &doneAtFixed},
				{BaseModel: entity.BaseModel{ID: "pm-2"}, ReportID: "rep-src-1", MissionBankID: "mb-2"},
			},
		},
	}
	f.uc.SetReportCloneDeps(rpt, mis)
	return &reportCloneFixture{linkMigrationFixture: f, rpt: rpt, mis: mis}
}

// TestLinkParticipantClonesReportsWithFreshTokensAndMissions: a same-program
// link must COPY every source report (2 per-Topic + 1 legacy whole-session
// row) into the target session with content/review state intact, a FRESH
// parent token (≠ source, distinct across copies), sent_at cleared, gallery
// tokens reset, GroupName re-denormalized, and the source report's
// participant_missions re-created under the clone's ID.
func TestLinkParticipantClonesReportsWithFreshTokensAndMissions(t *testing.T) {
	f := newReportCloneFixture("prog-A", "prog-A")

	res, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1")
	if err != nil {
		t.Fatalf("same-program link must succeed, got: %v", err)
	}
	if f.repo.updated == nil || f.repo.updated.SessionID == nil || *f.repo.updated.SessionID != "sess-1" {
		t.Fatalf("participant must be moved to sess-1, got %+v", f.repo.updated)
	}
	if res.PreviousSessionID != "sess-src" {
		t.Fatalf("migration context lost: %+v", res)
	}

	// Both reads are scoped participant+session+tenant (source first).
	if len(f.rpt.listCalls) != 2 {
		t.Fatalf("expected source + target report lists, got %d", len(f.rpt.listCalls))
	}
	if f.rpt.listCalls[0].SessionID != "sess-src" || f.rpt.listCalls[0].ParticipantID != "pid-1" || f.rpt.listCalls[0].TenantID != "tenant-1" {
		t.Fatalf("source list = %+v, want pid-1/sess-src scoped to tenant-1", f.rpt.listCalls[0])
	}
	if f.rpt.listCalls[1].SessionID != "sess-1" || f.rpt.listCalls[1].ParticipantID != "pid-1" || f.rpt.listCalls[1].TenantID != "tenant-1" {
		t.Fatalf("target list = %+v, want pid-1/sess-1 scoped to tenant-1", f.rpt.listCalls[1])
	}

	// Exactly three clones in the target session — one per source row,
	// including the legacy whole-session ("" stage) row.
	target := cloneReportsIn(f.rpt, "sess-1")
	if len(target) != 3 {
		t.Fatalf("expected 3 cloned reports in sess-1, got %d (%+v)", len(target), target)
	}
	src1 := reportByStage(cloneReportsIn(f.rpt, "sess-src"), "stage-1")
	if src1 == nil {
		t.Fatal("source stage-1 report vanished — the clone must COPY, never move")
	}
	if len(cloneReportsIn(f.rpt, "sess-src")) != 3 {
		t.Fatalf("source session must keep all 3 reports, got %d", len(cloneReportsIn(f.rpt, "sess-src")))
	}

	// Per-clone contract, keyed by the stage each one mirrors.
	for _, stage := range []string{"stage-1", "stage-2", ""} {
		got := reportByStage(target, stage)
		if got == nil {
			t.Fatalf("target session missing a clone for program_stage %q", stage)
		}
		if got.SessionID != "sess-1" || got.ParticipantID != "pid-1" {
			t.Fatalf("clone scope = participant %s session %s, want pid-1/sess-1", got.ParticipantID, got.SessionID)
		}
		if got.ID == "" || got.ID == "rep-src-1" || got.ID == "rep-src-2" || got.ID == "rep-src-legacy" {
			t.Fatalf("clone must get a fresh row ID, got %q", got.ID)
		}
		// Delivery reset: undelivered copy stays re-sendable.
		if got.SentAt != nil {
			t.Fatalf("clone for stage %q must clear sent_at, got %v", stage, *got.SentAt)
		}
		// Fresh parent token: non-empty, never the source's, never reused.
		if got.ParentAccessToken == "" {
			t.Fatalf("clone for stage %q must mint a fresh parent token", stage)
		}
		if got.ParentAccessToken == src1.ParentAccessToken || got.ParentAccessToken == "parent-token-src-2" || got.ParentAccessToken == "parent-token-src-legacy" {
			t.Fatalf("clone for stage %q reuses a source parent token %q", stage, got.ParentAccessToken)
		}
		// The source's token lifecycle does not follow the fresh token.
		if got.ParentTokenExpiresAt != nil || got.ParentTokenRevoked {
			t.Fatalf("clone for stage %q inherits parent-token lifecycle: exp=%v revoked=%v", stage, got.ParentTokenExpiresAt, got.ParentTokenRevoked)
		}
		// Gallery tokens reset: the QR is re-minted on demand, never inherited.
		if got.GalleryAccessToken != "" || got.GalleryTokenExpiresAt != nil || got.GalleryTokenRevoked {
			t.Fatalf("clone for stage %q inherits gallery tokens: %+v", stage, got)
		}
		// GroupName via the DENORM path: this link passed no groupID, so the
		// participant keeps pointing at the same group and Create's fresh
		// re-denormalization ("Kelompok Tujuan" — never the source's
		// "Kelompok Sumber") is correct by definition.
		if got.GroupName != "Kelompok Tujuan" {
			t.Fatalf("clone group_name = %q, want the freshly denormalized group", got.GroupName)
		}
	}

	// Fresh tokens are distinct ACROSS copies — GetByToken must stay unambiguous.
	seen := map[string]bool{}
	for i := range target {
		if seen[target[i].ParentAccessToken] {
			t.Fatalf("two clones share parent token %q (GetByToken would be ambiguous)", target[i].ParentAccessToken)
		}
		seen[target[i].ParentAccessToken] = true
	}

	// Content/review state carried: spot-check the richest source row.
	stage1Clone := reportByStage(target, "stage-1")
	if stage1Clone.AINarrativeDraft != "draft narasi satu" || stage1Clone.AINarrativeFinal != "final narasi satu" {
		t.Fatalf("narratives lost: %+v", stage1Clone)
	}
	if stage1Clone.Status != entity.ReportApproved {
		t.Fatalf("status = %q, want APPROVED", stage1Clone.Status)
	}
	if stage1Clone.ReportPDFURL != "pdf/rapor-1.pdf" {
		t.Fatalf("pdf url = %q, want pdf/rapor-1.pdf", stage1Clone.ReportPDFURL)
	}
	if stage1Clone.GeneratedAt == nil || !stage1Clone.GeneratedAt.Equal(genAtFixed) {
		t.Fatalf("generated_at = %v, want the source value", stage1Clone.GeneratedAt)
	}
	if stage1Clone.ApprovedBy == nil || *stage1Clone.ApprovedBy != "usr-approver" {
		t.Fatalf("approved_by = %v, want usr-approver", stage1Clone.ApprovedBy)
	}
	legacyClone := reportByStage(target, "")
	if legacyClone == nil || legacyClone.AINarrativeFinal != "final seluruh sesi" || legacyClone.Status != entity.ReportSent {
		t.Fatalf("legacy whole-session clone wrong: %+v", legacyClone)
	}

	// The SOURCE rows keep their own delivery history untouched.
	if src1.SentAt == nil || !src1.SentAt.Equal(sentAtFixed) {
		t.Fatalf("source sent_at must stay intact, got %v", src1.SentAt)
	}
	if src1.ParentAccessToken != "parent-token-src-1" || src1.GalleryAccessToken != "gallery-token-src-1" || !src1.GalleryTokenRevoked {
		t.Fatalf("source token state must stay intact, got %+v", src1)
	}

	// Missions: read for every source report (tenant-scoped), copied ONLY where
	// the source has rows — retargeted to the clone's ID with fresh row IDs.
	if len(f.mis.getCalls) != 3 {
		t.Fatalf("expected GetByReport for all 3 source reports, got %d (%+v)", len(f.mis.getCalls), f.mis.getCalls)
	}
	for _, c := range f.mis.getCalls {
		if c.tenantID != "tenant-1" {
			t.Fatalf("mission read tenant = %q, want tenant-1", c.tenantID)
		}
	}
	if len(f.mis.replaceCalls) != 1 {
		t.Fatalf("expected exactly 1 ReplaceByReport (only rep-src-1 has missions), got %d (%+v)", len(f.mis.replaceCalls), f.mis.replaceCalls)
	}
	rc := f.mis.replaceCalls[0]
	if rc.tenantID != "tenant-1" || rc.reportID != stage1Clone.ID {
		t.Fatalf("replace = %+v, want tenant-1 onto clone ID %s", rc, stage1Clone.ID)
	}
	items := f.mis.replaced[stage1Clone.ID]
	if len(items) != 2 {
		t.Fatalf("expected 2 cloned missions, got %d (%+v)", len(items), items)
	}
	for i := range items {
		if items[i].ReportID != stage1Clone.ID {
			t.Fatalf("mission %d report_id = %q, want the clone ID %q", i, items[i].ReportID, stage1Clone.ID)
		}
		if items[i].ID != "" {
			t.Fatalf("mission %d must carry a zero ID for BeforeCreate to mint, got %q", i, items[i].ID)
		}
	}
	if items[0].MissionBankID != "mb-1" || !items[0].IsCompleted || items[0].CompletedAt == nil || !items[0].CompletedAt.Equal(doneAtFixed) {
		t.Fatalf("completed mission lost state: %+v", items[0])
	}
	if items[1].MissionBankID != "mb-2" || items[1].IsCompleted || items[1].CompletedAt != nil {
		t.Fatalf("pending mission lost state: %+v", items[1])
	}
}

// Fixed timestamps shared by the fixture seed and the clone assertions.
var (
	genAtFixed  = time.Date(2026, 2, 1, 8, 0, 0, 0, time.UTC)
	sentAtFixed = time.Date(2026, 2, 2, 9, 0, 0, 0, time.UTC)
	expAtFixed  = time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC)
	doneAtFixed = time.Date(2026, 2, 3, 10, 0, 0, 0, time.UTC)
)

// TestLinkParticipantReportCloneStampsExplicitTargetGroupName: linking WITH an
// explicit target group must stamp every clone with THAT group's name. The
// clone runs before the participant move, so relying on Create's
// participants.group_id denormalization would still read the SOURCE group —
// the validated target group's Name is captured up front and passed in
// instead (Create only denormalizes an empty GroupName, so this wins).
func TestLinkParticipantReportCloneStampsExplicitTargetGroupName(t *testing.T) {
	f := newReportCloneFixture("prog-A", "prog-A")
	// Three distinct names on purpose: source group, Create's denorm result,
	// and the explicit target group — only the last may win here.
	f.repo.groups["grp-1"].Name = "Kelompok Target"

	res, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "grp-1", "tenant-1")
	if err != nil {
		t.Fatalf("link with explicit group must succeed, got: %v", err)
	}
	if res.Participant.GroupID == nil || *res.Participant.GroupID != "grp-1" {
		t.Fatalf("participant must end up in grp-1, got %v", res.Participant.GroupID)
	}
	target := cloneReportsIn(f.rpt, "sess-1")
	if len(target) != 3 {
		t.Fatalf("expected 3 cloned reports, got %d (%+v)", len(target), target)
	}
	for i := range target {
		if target[i].GroupName != "Kelompok Target" {
			t.Fatalf("clone %q group_name = %q, want the explicit target group name %q (denorm would say %q, source said %q)",
				target[i].ID, target[i].GroupName, "Kelompok Target", "Kelompok Tujuan", "Kelompok Sumber")
		}
	}
}

// TestLinkParticipantReportCloneRetryDoesNotDuplicate: running the whole link
// (and therefore the clone path) a second time — the retry after a partially
// applied migration — must not create a single extra report row: the target
// slot index skips every topic the first run already cloned, and the mission
// copy replaces instead of appending.
func TestLinkParticipantReportCloneRetryDoesNotDuplicate(t *testing.T) {
	f := newReportCloneFixture("prog-A", "prog-A")

	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("first link must succeed, got: %v", err)
	}
	if len(f.rpt.created) != 3 {
		t.Fatalf("first link must clone 3 reports, got %d", len(f.rpt.created))
	}
	stage1Clone := reportByStage(cloneReportsIn(f.rpt, "sess-1"), "stage-1")
	if stage1Clone == nil {
		t.Fatal("first link must produce the stage-1 clone")
	}

	// Retry: the fake participant still reports the source session (the move
	// write is what a lost/partial run would have dropped), so the whole
	// migration path — including the report clone — runs again.
	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("retry link must succeed, got: %v", err)
	}
	if len(f.rpt.created) != 3 {
		t.Fatalf("retry must not create a second copy, got %d creates", len(f.rpt.created))
	}
	if target := cloneReportsIn(f.rpt, "sess-1"); len(target) != 3 {
		t.Fatalf("target session must hold exactly 3 report rows after retry, got %d", len(target))
	}
	// The mission copy re-ran against the SAME clone (ReplaceByReport =
	// delete + insert) — rows never accumulate.
	if len(f.mis.replaceCalls) != 2 || f.mis.replaceCalls[1].reportID != stage1Clone.ID {
		t.Fatalf("retry must re-run ReplaceByReport on the existing clone, got %+v", f.mis.replaceCalls)
	}
	if rows := f.mis.rows[stage1Clone.ID]; len(rows) != 2 {
		t.Fatalf("missions must not duplicate on retry, got %d rows", len(rows))
	}
}

// TestLinkParticipantReportConflictSkipConverges: a target slot that List
// cannot see (soft-deleted tombstone still holding the physical unique slot)
// makes Create fail with a conflict app-error — the topic is skipped, the rest
// of the clone proceeds, and the link completes without duplicating anything.
func TestLinkParticipantReportConflictSkipConverges(t *testing.T) {
	f := newReportCloneFixture("prog-A", "prog-A")
	// Tombstone: (sess-1, pid-1, stage-1) is physically occupied but hidden
	// from List — exactly the row state the real unique index enforces.
	f.rpt.rows = append(f.rpt.rows, entity.Report{
		BaseModel:      entity.BaseModel{ID: "rep-tomb-1"},
		ParticipantID:  "pid-1",
		SessionID:      "sess-1",
		ProgramStageID: "stage-1",
	})
	f.rpt.hidden["rep-tomb-1"] = true

	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("conflict-skip must converge, not fail the link, got: %v", err)
	}
	if f.repo.updated == nil || *f.repo.updated.SessionID != "sess-1" {
		t.Fatal("participant must still be moved")
	}
	// stage-1 collided with the tombstone → skipped; stage-2 + legacy cloned.
	if len(f.rpt.created) != 2 {
		t.Fatalf("expected exactly 2 clones (stage-1 conflict-skipped), got %d", len(f.rpt.created))
	}
	target := cloneReportsIn(f.rpt, "sess-1")
	if reportByStage(target, "stage-1") != nil {
		t.Fatal("conflict-skipped stage-1 must not gain a visible row")
	}
	if reportByStage(target, "stage-2") == nil || reportByStage(target, "") == nil {
		t.Fatalf("remaining topics must still clone, got %+v", target)
	}
	// The skipped topic's missions are left to the pre-existing row: the
	// conflict path never reads or writes them.
	if len(f.mis.getCalls) != 2 {
		t.Fatalf("conflict-skipped report must not be mission-read, got %d reads (%+v)", len(f.mis.getCalls), f.mis.getCalls)
	}
	for _, c := range f.mis.getCalls {
		if c.reportID == "rep-src-1" {
			t.Fatalf("stage-1 source must be skipped entirely, got read %+v", c)
		}
	}
}

// TestLinkParticipantCrossProgramWritesNoReports: a cross-program link now
// SUCCEEDS but starts scratch — the report repos must not even be read, let
// alone written (no rapor clone without a matching program), while the
// participant still moves to the target session.
func TestLinkParticipantCrossProgramWritesNoReports(t *testing.T) {
	f := newReportCloneFixture("prog-A", "prog-B")

	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("cross-program link must succeed (scratch path), got: %v", err)
	}
	if f.repo.updated == nil || f.repo.updated.SessionID == nil || *f.repo.updated.SessionID != "sess-1" {
		t.Fatalf("participant must be moved despite the skipped report clone, got %+v", f.repo.updated)
	}

	if len(f.rpt.listCalls) != 0 || len(f.rpt.created) != 0 {
		t.Fatalf("cross-program link must not touch reports: list=%d created=%d",
			len(f.rpt.listCalls), len(f.rpt.created))
	}
	if len(f.mis.getCalls) != 0 || len(f.mis.replaceCalls) != 0 {
		t.Fatalf("cross-program link must not touch missions: get=%d replace=%d",
			len(f.mis.getCalls), len(f.mis.replaceCalls))
	}
}

// TestLinkParticipantReportCloneNoOps: a source session without reports and a
// usecase with unwired report deps are both plain no-ops — the link succeeds,
// the participant moves, and nothing is written (and the unwired path never
// panics).
func TestLinkParticipantReportCloneNoOps(t *testing.T) {
	t.Run("source_without_reports", func(t *testing.T) {
		f := newReportCloneFixture("prog-A", "prog-A")
		f.rpt.rows = nil // participant has no reports in sess-src

		if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
			t.Fatalf("empty source must not fail the link, got: %v", err)
		}
		if f.repo.updated == nil || *f.repo.updated.SessionID != "sess-1" {
			t.Fatal("participant must still be moved")
		}
		if len(f.rpt.created) != 0 {
			t.Fatalf("no reports to clone, got %d creates", len(f.rpt.created))
		}
		if len(f.mis.getCalls) != 0 || len(f.mis.replaceCalls) != 0 {
			t.Fatalf("missions must stay untouched: get=%d replace=%d",
				len(f.mis.getCalls), len(f.mis.replaceCalls))
		}
	})

	t.Run("unwired_deps", func(t *testing.T) {
		// SetReportCloneDeps never called: the clone step is a documented
		// optional no-op, exactly like an unwired badgeReconciler.
		f := newLinkMigrationFixture("prog-A", "prog-A")

		if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
			t.Fatalf("unwired report deps must skip the clone, got: %v", err)
		}
		if f.repo.updated == nil || *f.repo.updated.SessionID != "sess-1" {
			t.Fatal("participant must still be moved when the report deps are unwired")
		}
	})
}

// TestLinkParticipantReportCloneFailuresPropagateAndDoNotMove: a report list
// or create failure surfaces as an explicit error and leaves the participant
// in the source session. Ordering is asserted from the fixture's other steps:
// attendance was already carried (the report clone runs after it) and the
// badge reconcile has NOT run yet (the report clone runs before it).
func TestLinkParticipantReportCloneFailuresPropagateAndDoNotMove(t *testing.T) {
	ctx := context.Background()

	t.Run("report_list_failure", func(t *testing.T) {
		f := newReportCloneFixture("prog-A", "prog-A")
		f.rpt.listErr = apperrors.Internal("internal_error", nil)

		_, err := f.uc.LinkParticipant(ctx, "sess-1", "pid-1", "", "tenant-1")
		requireAppErrorCode(t, err, "internal_error")
		if f.repo.updated != nil {
			t.Fatal("participant must stay in the source session when the report list fails")
		}
		if len(f.att.upserts) != 1 {
			t.Fatalf("attendance must be carried BEFORE the report clone, got %d upserts", len(f.att.upserts))
		}
		if f.prog.listStagesCalls != 0 {
			t.Fatalf("badge reconcile must not run when the report clone fails, got %d runs", f.prog.listStagesCalls)
		}
	})

	t.Run("report_create_failure", func(t *testing.T) {
		f := newReportCloneFixture("prog-A", "prog-A")
		f.rpt.createErr = apperrors.Internal("internal_error", nil)

		_, err := f.uc.LinkParticipant(ctx, "sess-1", "pid-1", "", "tenant-1")
		requireAppErrorCode(t, err, "internal_error")
		if f.repo.updated != nil {
			t.Fatal("participant must stay in the source session when the report write fails")
		}
		if len(f.rpt.created) != 0 {
			t.Fatalf("no report row may be created on failure, got %d", len(f.rpt.created))
		}
		if f.prog.listStagesCalls != 0 {
			t.Fatalf("badge reconcile must not run when the report clone fails, got %d runs", f.prog.listStagesCalls)
		}
	})
}
