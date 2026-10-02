package auth_test

import (
	"context"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// TestCompleteSession_PerTopicGate blocks while the second topic's leaf is
// ungraded (pra-Bug1: topik-2 tak bisa dinilai ⇒ complete tertahan) and
// passes once every leaf across both topics is graded (pasca Perbaikan-1).
// The gate itself is unchanged — this pins the per-topic behavior.
func TestCompleteSession_PerTopicGate(t *testing.T) {
	const (
		sessionID = "session-complete-topics"
		partID    = "participant-1"
		groupID   = "group-1"
		tenantID  = "tenant-real"
		topic1    = "ssub-topic-1"
		topic2    = "ssub-topic-2"
	)
	gid := groupID
	sess := &entity.Session{
		BaseModel: entity.BaseModel{ID: sessionID},
		TenantID:  completeGateTenant(tenantID),
		Status:    entity.SessionActive,
	}
	groups := []entity.SessionGroup{{BaseModel: entity.BaseModel{ID: groupID}, SessionID: sessionID, Name: "Kelompok Kuning", Status: entity.GroupInProgress}}
	parts := []entity.Participant{{BaseModel: entity.BaseModel{ID: partID}, GroupID: &gid, ChildName: "Citra Lestari"}}
	subs := []entity.SessionSubstage{
		{BaseModel: entity.BaseModel{ID: topic1}, SessionID: sessionID},
		{BaseModel: entity.BaseModel{ID: topic2}, SessionID: sessionID},
	}

	// Pra-Bug1: only topic-1 graded → gate stays shut with grading_incomplete.
	assess := &fakeCompleteGateAssessmentRepo{
		tenantID: tenantID,
		scores:   map[string]int{partID + "|" + topic1: 4},
	}
	uc, repo := newCompleteGateUsecase(sess, groups, parts, subs, assess)
	if _, err := uc.CompleteSession(context.Background(), sessionID, tenantID); err == nil {
		t.Fatal("gate must block while topic-2 has no assessment")
	} else {
		requireAppErrorCode(t, err, "grading_incomplete")
	}
	if repo.session.Status != entity.SessionActive {
		t.Fatalf("session must stay ACTIVE while blocked, got %q", repo.session.Status)
	}

	// Pasca Perbaikan-1: topic-2 graded → completion succeeds.
	assess.scores[partID+"|"+topic2] = 5
	if _, err := uc.CompleteSession(context.Background(), sessionID, tenantID); err != nil {
		t.Fatalf("gate must pass once both topics are graded: %v", err)
	}
	if repo.session.Status != entity.SessionCompleted {
		t.Fatalf("session must be COMPLETED after the gate passes, got %q", repo.session.Status)
	}
}
