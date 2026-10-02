package badge_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	assessmentuc "kidversa-edutourism-backend/internal/usecase/assessment"
)

// newGrownProgramFixture builds the Bug-4 scenario: a program that grew from
// one to three Topik AFTER the participant earned the stageA SUBTOPIK badge
// and the FINAL badge. Topik B and C exist in the program and the session but
// are unassessed — the seeded FINAL is therefore stale (not all Topik
// assessed anymore).
func newGrownProgramFixture(t *testing.T) *fixture {
	t.Helper()
	f := newFixture()

	stageC := &entity.ProgramStage{
		BaseModel:     entity.BaseModel{ID: "stageC"},
		ProgramID:     testProgramID,
		SequenceOrder: 3,
		Name:          "Topik C",
		BadgeName:     "Ahli Topik C",
		BadgeImageURL: "imgC",
	}
	f.progRepo.stages["stageC"] = stageC
	psC1 := entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: "psC1"}, ProgramStageID: "stageC", Name: "Kegiatan C1"}
	psC2 := entity.ProgramSubstage{BaseModel: entity.BaseModel{ID: "psC2"}, ProgramStageID: "stageC", Name: "Kegiatan C2"}
	f.progSubs.byID["psC1"] = psC1
	f.progSubs.byID["psC2"] = psC2
	f.progSubs.byStage["stageC"] = []entity.ProgramSubstage{psC1, psC2}
	f.store.substages["subC1"] = entity.SessionSubstage{
		BaseModel: entity.BaseModel{ID: "subC1"}, SessionID: testSessionID,
		SessionStageID: "ssC", ProgramSubstageID: "psC1",
	}
	f.store.substages["subC2"] = entity.SessionSubstage{
		BaseModel: entity.BaseModel{ID: "subC2"}, SessionID: testSessionID,
		SessionStageID: "ssC", ProgramSubstageID: "psC2",
	}
	f.store.order = append(f.store.order, "subC1", "subC2")

	// Seed the badges earned back when the program had a single Topik: the
	// SUBTOPIK row for stageA plus the (now stale) FINAL row.
	stageA := "stageA"
	f.store.badges = append(f.store.badges,
		entity.ParticipantBadge{
			BaseModel:      entity.BaseModel{ID: "badge-seed-subtopik-a"},
			ParticipantID:  testParticipantID,
			ProgramID:      testProgramID,
			ProgramStageID: &stageA,
			BadgeType:      entity.BadgeTypeSubtopik,
			BadgeName:      "Ahli Topik A",
			BadgeImageURL:  "imgA",
		},
		entity.ParticipantBadge{
			BaseModel:     entity.BaseModel{ID: "badge-seed-final"},
			ParticipantID: testParticipantID,
			ProgramID:     testProgramID,
			BadgeType:     entity.BadgeTypeFinal,
			BadgeName:     "Juara Akhir",
			BadgeImageURL: "final-img",
		},
	)
	return f
}

// TestBadgeFlowGrownProgramMigrationRevokesFinalAndLastTopicReawardsIt is the
// Bug-4 gugur → raih lifecycle:
//  1. migration reconcile (the exact RecomputeFinalBadge entry point
//     LinkParticipant runs after copying assessments/attendance) REVOKES the
//     stale FINAL of the grown program while KEEPING the SUBTOPIK badge;
//  2. re-earn through the REAL assessment chain — Upsert → afterUpsert →
//     EvaluateAfterAssessment → RecomputeFinalBadge: after the 2nd of 3 Topik
//     there is still NO FINAL; the 3rd Topik's completion re-awards it;
//  3. further recomputes on the complete program change nothing.
func TestBadgeFlowGrownProgramMigrationRevokesFinalAndLastTopicReawardsIt(t *testing.T) {
	f := newGrownProgramFixture(t)
	ctx := context.Background()

	// Precondition: SUBTOPIK stageA + the FINAL earned on the 1-Topik program.
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageA", name: "Ahli Topik A"},
		{badgeType: entity.BadgeTypeFinal, stageID: "", name: "Juara Akhir"},
	})

	// 1. Migration reconcile: program now has 3 Topik, only stageA assessed →
	// stale FINAL revoked, SUBTOPIK retained.
	if _, err := f.badgeUC.RecomputeFinalBadge(ctx, testParticipantID, testProgramID); err != nil {
		t.Fatalf("RecomputeFinalBadge (migration hook): %v", err)
	}
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageA", name: "Ahli Topik A"},
	})

	// 2. Re-earn through the real assessment upsert path (session must be ACTIVE).
	f.sessRepo.session.Status = entity.SessionActive
	aUC := assessmentuc.NewUsecase(f.assess, f.sessRepo, f.badgeUC)
	upsertScore := func(substageID string) {
		t.Helper()
		if _, err := aUC.Upsert(ctx, repository.AssessmentFilter{
			ParticipantID:     testParticipantID,
			SessionID:         testSessionID,
			SessionSubstageID: substageID,
		}, 3, "", "fas-1", "", "ADMIN", time.Time{}, testTenant); err != nil {
			t.Fatalf("Upsert(%s): %v", substageID, err)
		}
	}

	// Topik B complete → its SUBTOPIK lands, but Topik C is still unassessed →
	// the FINAL must NOT be re-awarded after only the 2nd of 3 Topik.
	upsertScore("subB1")
	upsertScore("subB2")
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageA", name: "Ahli Topik A"},
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageB", name: "Ahli Topik B"},
	})

	// Topik C (the 3rd and last) complete → the FINAL is re-awarded.
	upsertScore("subC1")
	upsertScore("subC2")
	assertBadges(t, f.badges(t), []wantBadge{
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageA", name: "Ahli Topik A"},
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageB", name: "Ahli Topik B"},
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageC", name: "Ahli Topik C"},
		{badgeType: entity.BadgeTypeFinal, stageID: "", name: "Juara Akhir"},
	})

	// 3. Idempotency: repeated recompute on the complete program adds nothing.
	want := []wantBadge{
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageA", name: "Ahli Topik A"},
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageB", name: "Ahli Topik B"},
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageC", name: "Ahli Topik C"},
		{badgeType: entity.BadgeTypeFinal, stageID: "", name: "Juara Akhir"},
	}
	for i := range 3 {
		if _, err := f.badgeUC.RecomputeFinalBadge(ctx, testParticipantID, testProgramID); err != nil {
			t.Fatalf("RecomputeFinalBadge #%d: %v", i+1, err)
		}
	}
	assertBadges(t, f.badges(t), want)
}

// TestRecomputeFinalBadgeOnCompleteProgramIsIdempotent: recompute on an
// already-complete program never duplicates rows — the award path is only
// reachable after the completion check found zero FINAL rows.
func TestRecomputeFinalBadgeOnCompleteProgramIsIdempotent(t *testing.T) {
	f := newFixture()
	f.completeTopic(t, "subA1", "subA2", "subB1", "subB2")
	want := []wantBadge{
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageA", name: "Ahli Topik A"},
		{badgeType: entity.BadgeTypeSubtopik, stageID: "stageB", name: "Ahli Topik B"},
		{badgeType: entity.BadgeTypeFinal, stageID: "", name: "Juara Akhir"},
	}
	assertBadges(t, f.badges(t), want)

	for i := range 3 {
		if _, err := f.badgeUC.RecomputeFinalBadge(context.Background(), testParticipantID, testProgramID); err != nil {
			t.Fatalf("RecomputeFinalBadge #%d: %v", i+1, err)
		}
	}
	assertBadges(t, f.badges(t), want)
}

// TestRecomputeFinalBadgeRevokingFinalSurfacesRevokeError: a failed revoke is
// an explicit, contextualized error — never swallowed — and the stale row is
// NOT silently dropped: the next run still sees it and can revoke again.
func TestRecomputeFinalBadgeRevokingFinalSurfacesRevokeError(t *testing.T) {
	f := newGrownProgramFixture(t)
	f.store.revokeErr = apperrors.Internal("internal_error", errors.New("badge db down"))

	_, err := f.badgeUC.RecomputeFinalBadge(context.Background(), testParticipantID, testProgramID)
	if err == nil {
		t.Fatal("revoke failure must surface as an error, got nil")
	}
	if !strings.Contains(err.Error(), "revoke FINAL badge participant=p1 program=prog1") ||
		!strings.Contains(err.Error(), "badge db down") {
		t.Errorf("error must carry participant/program context and cause, got: %v", err)
	}
	rows := f.badges(t)
	if len(rows) != 2 {
		t.Fatalf("badge rows = %d (%+v), want 2 (stale FINAL kept after failed revoke)", len(rows), rows)
	}
	if rows[1].BadgeType != entity.BadgeTypeFinal {
		t.Fatalf("rows[1] = %+v, want the still-present FINAL", rows[1])
	}
}
