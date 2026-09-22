package frame_test

import (
	"testing"

	"kidversa-edutourism-backend/internal/infrastructure/persistence"
)

func TestPhotoFrameModel_ToEntity_KeepsTimestamps(t *testing.T) {
	m := &persistence.PhotoFrameModel{}
	if err := m.BeforeCreate(nil); err != nil {
		t.Fatalf("BeforeCreate: %v", err)
	}
	ent := m.ToEntity()
	if ent.CreatedAt.IsZero() {
		t.Error("created_at zero: timestamp assigned by BeforeCreate lost by ToEntity (shadowed field regression)")
	}
	if ent.UpdatedAt.IsZero() {
		t.Error("updated_at zero: same shadowed-field regression")
	}
}
