package reports_test

import (
	"context"
	"testing"

	"kidversa-edutourism-backend/internal/usecase/reports"
)

// TestSuggestMissions_EmptyBank_SkippedWithoutError pins the Bug5 contract:
// an empty mission bank for the Topic returns ([], nil) — an explicit skip
// (mission_bank_empty, logged in SuggestMissions), never an error, so the
// mission phase marks the item skipped and the frontend must not toast.
func TestSuggestMissions_EmptyBank_SkippedWithoutError(t *testing.T) {
	repo := newGenRepo("p-a")
	markTopicScoped(repo, "stage1")
	gen := newBlockingGen("r-p-a")
	sess := &genSessionRepo{participants: newParticipants(1)}
	pm := newParticipantMissionFake()
	uc := newMissionUsecase(repo, gen, sess, &missionBankFake{}, pm) // empty bank

	ids, err := uc.SuggestMissions(context.Background(), "r-p-a", testTenantID)
	if err != nil {
		t.Fatalf("empty bank must not error, got %v", err)
	}
	if len(ids) != 0 {
		t.Errorf("empty bank must return no ids, got %v", ids)
	}

	// Skip reason constant is the machine-readable marker the mission phase
	// records (registry) and the envelope exposes.
	if reports.SkipReasonMissionBankEmpty != "mission_bank_empty" {
		t.Errorf("SkipReasonMissionBankEmpty = %q, want %q",
			reports.SkipReasonMissionBankEmpty, "mission_bank_empty")
	}
}
