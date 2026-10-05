package auth_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	reportsuc "kidversa-edutourism-backend/internal/usecase/reports"
)

// ---------------------------------------------------------------------------
// Provenance (penelusuran asal klonaan) + report status downgrade tests for
// LinkParticipant: every cloned/carry row records the source session it came
// from (id + name/status snapshot for reports), native rows stay null, and a
// cloned report ALWAYS lands DRAFT with sent_at nil whatever the source's
// status — while the source rows themselves are never written. Hand-rolled
// fakes only, no DB (same pattern as participant_report_clone_test.go).
// ---------------------------------------------------------------------------

// TestLinkParticipantReportCloneDowngradesAndStampsProvenance: the audit
// contract for report clones — sources SENT and APPROVED produce clones in
// DRAFT with sent_at nil and a provenance snapshot of the source session
// (id, name, status AT CLONE TIME — even for an ACTIVE source: provenance is
// neutral, the FE filters), while the source rows keep their own status,
// sent_at and null provenance untouched.
func TestLinkParticipantReportCloneDowngradesAndStampsProvenance(t *testing.T) {
	f := newReportCloneFixture("prog-A", "prog-A")
	// Name + status the snapshot must capture; ACTIVE proves provenance is
	// neutral (not reserved for cancelled/completed sources).
	f.repo.extraSessions["sess-src"].Name = "Sesi Sumber"
	f.repo.extraSessions["sess-src"].Status = entity.SessionActive

	res, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1")
	if err != nil {
		t.Fatalf("same-program link must succeed, got: %v", err)
	}
	if res.PreviousSessionName != "Sesi Sumber" {
		t.Fatalf("previous session name = %q, want the source identity", res.PreviousSessionName)
	}

	target := cloneReportsIn(f.rpt, "sess-1")
	if len(target) != 3 {
		t.Fatalf("expected 3 clones in sess-1, got %d", len(target))
	}
	// Stage-1 source is APPROVED, legacy source is SENT, stage-2 is DRAFT —
	// every one must come out DRAFT with sent_at nil.
	for _, stage := range []string{"stage-1", "stage-2", ""} {
		got := reportByStage(target, stage)
		if got == nil {
			t.Fatalf("missing clone for program_stage %q", stage)
		}
		if got.Status != entity.ReportDraft {
			t.Fatalf("clone (stage %q) status = %q, want DRAFT regardless of the source's status", stage, got.Status)
		}
		if got.SentAt != nil {
			t.Fatalf("clone (stage %q) sent_at = %v, want nil", stage, *got.SentAt)
		}
		if got.SourceSessionID == nil || *got.SourceSessionID != "sess-src" {
			t.Fatalf("clone (stage %q) source_session_id = %v, want sess-src", stage, got.SourceSessionID)
		}
		if got.SourceSessionName == nil || *got.SourceSessionName != "Sesi Sumber" {
			t.Fatalf("clone (stage %q) source_session_name = %v, want Sesi Sumber", stage, got.SourceSessionName)
		}
		if got.SourceSessionStatus == nil || *got.SourceSessionStatus != string(entity.SessionActive) {
			t.Fatalf("clone (stage %q) source_session_status = %v, want %s", stage, got.SourceSessionStatus, entity.SessionActive)
		}
	}

	// The sources are native rows: statuses/delivery history untouched,
	// provenance null (they were never cloned from anywhere).
	src := cloneReportsIn(f.rpt, "sess-src")
	approved := reportByStage(src, "stage-1")
	if approved == nil || approved.Status != entity.ReportApproved || approved.SentAt == nil {
		t.Fatalf("APPROVED source must stay untouched, got %+v", approved)
	}
	sent := reportByStage(src, "")
	if sent == nil || sent.Status != entity.ReportSent || sent.SentAt == nil {
		t.Fatalf("SENT source must stay untouched, got %+v", sent)
	}
	for i := range src {
		if src[i].SourceSessionID != nil || src[i].SourceSessionName != nil || src[i].SourceSessionStatus != nil {
			t.Fatalf("native source report must keep null provenance, got %+v", src[i])
		}
	}
}

// TestLinkParticipantStampsAssessmentAndAttendanceProvenance: the assessment
// and attendance copy steps stamp SourceSessionID on every copied row, while
// the source rows (natively created) keep nil.
func TestLinkParticipantStampsAssessmentAndAttendanceProvenance(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")

	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("same-program link must succeed, got: %v", err)
	}

	if len(f.asmt.created) == 0 {
		t.Fatal("expected assessment clones for the same-program link")
	}
	for i := range f.asmt.created {
		got := f.asmt.created[i]
		if got.SessionID != "sess-1" {
			t.Fatalf("assessment clone session = %q, want sess-1", got.SessionID)
		}
		if got.SourceSessionID == nil || *got.SourceSessionID != "sess-src" {
			t.Fatalf("assessment clone source_session_id = %v, want sess-src", got.SourceSessionID)
		}
	}
	// The seeded source assessments are native rows — null provenance.
	for i := range f.asmt.rows {
		if f.asmt.rows[i].SourceSessionID != nil {
			t.Fatalf("native assessment must keep null provenance, got %+v", f.asmt.rows[i])
		}
	}

	if len(f.att.upserts) == 0 {
		t.Fatal("expected attendance rows carried to the target session")
	}
	for i := range f.att.upserts {
		got := f.att.upserts[i]
		if got.SessionID != "sess-1" {
			t.Fatalf("carried attendance session = %q, want sess-1", got.SessionID)
		}
		if got.SourceSessionID == nil || *got.SourceSessionID != "sess-src" {
			t.Fatalf("carried attendance source_session_id = %v, want sess-src", got.SourceSessionID)
		}
	}
	if src := f.att.rows["pid-1|sess-src|ss-src"]; src == nil || src.SourceSessionID != nil {
		t.Fatalf("native attendance row must stay untouched with null provenance, got %+v", src)
	}
}

// TestReportProvenanceJSONNullable pins the FE DTO contract: source_session_id
// / source_session_name / source_session_status are ALWAYS present in report
// JSON — null for natively created reports, the clone's snapshot values for
// clones — in both the authenticated admin DTO and the public parent view.
func TestReportProvenanceJSONNullable(t *testing.T) {
	native := &entity.Report{
		BaseModel: entity.BaseModel{ID: "rep-native"},
		Status:    entity.ReportDraft,
	}
	clone := &entity.Report{
		BaseModel:           entity.BaseModel{ID: "rep-clone"},
		Status:              entity.ReportDraft,
		SourceSessionID:     new("sess-src"),
		SourceSessionName:   new("Sesi Sumber"),
		SourceSessionStatus: new(string(entity.SessionActive)),
	}
	keys := []string{"source_session_id", "source_session_name", "source_session_status"}

	for _, tc := range []struct {
		name     string
		r        *entity.Report
		wantNull bool
	}{
		{name: "native", r: native, wantNull: true},
		{name: "clone", r: clone, wantNull: false},
	} {
		// Admin list/detail DTO (embeds the entity → entity JSON tags flow).
		admin, err := json.Marshal(dto.ReportResponse{Report: tc.r})
		if err != nil {
			t.Fatalf("%s admin DTO marshal: %v", tc.name, err)
		}
		// Public parent view DTO (explicit fields).
		pub, err := json.Marshal(dto.NewPublicReportDTO(tc.r, &reportsuc.PublicReportView{}, ""))
		if err != nil {
			t.Fatalf("%s public DTO marshal: %v", tc.name, err)
		}
		for _, payload := range []string{string(admin), string(pub)} {
			for _, key := range keys {
				if !strings.Contains(payload, `"`+key+`"`) {
					t.Fatalf("%s DTO missing always-present key %s: %s", tc.name, key, payload)
				}
				if tc.wantNull && !strings.Contains(payload, `"`+key+`":null`) {
					t.Fatalf("%s DTO must carry %s as null: %s", tc.name, key, payload)
				}
			}
		}
		if tc.wantNull {
			continue
		}
		if !strings.Contains(string(admin), `"source_session_id":"sess-src"`) ||
			!strings.Contains(string(pub), `"source_session_name":"Sesi Sumber"`) ||
			!strings.Contains(string(pub), `"source_session_status":"ACTIVE"`) {
			t.Fatalf("clone DTO lost its provenance snapshot: admin=%s public=%s", admin, pub)
		}
	}
}
