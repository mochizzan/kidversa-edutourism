package persistence

import (
	"context"
	"testing"
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// TestB15CoreTablesExist verifies the 6 core tables from migration 000007 are present.
func TestB15CoreTablesExist(t *testing.T) {
	db := openTestDB(t)
	tables := []string{
		"reports", "participant_missions", "smart_photos",
		"recordings", "assessments", "consent_logs",
	}
	for _, tbl := range tables {
		var cnt int64
		if err := db.Raw("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?", tbl).Scan(&cnt).Error; err != nil {
			t.Fatalf("query table list: %v", err)
		}
		if cnt != 1 {
			t.Fatalf("expected table %q to exist after migration 000007", tbl)
		}
	}
}

func seedTenant(db *gorm.DB) string {
	tid := newUUID()
	if err := db.Exec("INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(3), NOW(3))", tid, "Test Tenant "+tid[:8], "test-"+tid).Error; err != nil {
		return ""
	}
	return tid
}

func seedUser(db *gorm.DB, tenantID string) string {
	uid := newUUID()
	if err := db.Exec("INSERT INTO users (id, tenant_id, email, password_hash, role, name, is_active, approval_status, created_at, updated_at) VALUES (?, ?, ?, '', 'SUPER_ADMIN', 'Test User', 1, 'approved', NOW(3), NOW(3))",
		uid, tenantID, "test-"+uid+"@example.com").Error; err != nil {
		return ""
	}
	return uid
}

func seedParticipant(db *gorm.DB, tenantID string) string {
	p := entity.Participant{
		BaseModel:   entity.BaseModel{ID: newUUID()},
		TenantID:    &tenantID,
		ChildName:   "Test Child",
		ParentName:  "Test Parent",
		ParentPhone: "08123",
	}
	pm := participantModelFromEntity(&p)
	if err := db.Create(&pm).Error; err != nil {
		return ""
	}
	return p.ID
}

func seedSession(db *gorm.DB, tenantID, programID, createdBy string) string {
	s := entity.Session{
		BaseModel:   entity.BaseModel{ID: newUUID()},
		TenantID:    &tenantID,
		ProgramID:   programID,
		Name:        "Test Session",
		SessionDate: "2026-07-20",
		Location:    "Lab",
		Status:      entity.SessionDraft,
		CreatedBy:   &createdBy,
	}
	sm := sessionModelFromEntity(&s)
	if err := db.Create(&sm).Error; err != nil {
		return ""
	}
	return s.ID
}

// TestB5PhotoMapUpdatePersist verifies a photo row persists an is_active-style field
// change via map update (plan C2) and is read back correctly.
func TestB5PhotoMapUpdatePersist(t *testing.T) {
	db := openTestDB(t)
	tenant := seedTenant(db)
	user := seedUser(db, tenant)
	program := seedProgram(db, tenant)
	frame := seedFrame(db, tenant, program)
	pid := seedParticipant(db, tenant)
	sid := seedSession(db, tenant, program, user)
	ctx := context.Background()

	photo := &entity.SmartPhoto{
		ParticipantID:   pid,
		SessionID:       sid,
		FrameID:         frame,
		OriginalFileURL: "/uploads/test.jpg",
		IsReportPhoto:   false,
		SyncStatus:      entity.SyncLocal,
		TakenAt:         "2026-07-20 10:00:00",
	}
	if err := NewPhotoRepository(db).Create(ctx, photo); err != nil {
		t.Fatalf("create photo: %v", err)
	}
	if photo.ID == "" {
		t.Fatalf("photo ID not generated")
	}

	// Flip is_report_photo via map update (C2 pattern, mirrors B5-B8).
	if err := db.Model(&SmartPhotoModel{}).Where("id = ?", photo.ID).
		Updates(map[string]interface{}{"is_report_photo": true, "updated_at": time.Now()}).Error; err != nil {
		t.Fatalf("map update: %v", err)
	}

	var m SmartPhotoModel
	if err := db.Where("id = ?", photo.ID).First(&m).Error; err != nil {
		t.Fatalf("read back: %v", err)
	}
	if !m.IsReportPhoto {
		t.Fatalf("expected is_report_photo=true after map update, got false")
	}
}

// TestB9ParticipantMissionTxReplace verifies bulk replace is atomic (delete+insert in a tx).
func TestB9ParticipantMissionTxReplace(t *testing.T) {
	db := openTestDB(t)
	tenant := seedTenant(db)
	user := seedUser(db, tenant)
	program := seedProgram(db, tenant)
	pid := seedParticipant(db, tenant)
	sid := seedSession(db, tenant, program, user)
	ctx := context.Background()

	report := &entity.Report{ParticipantID: pid, SessionID: sid, Status: entity.ReportDraft}
	if err := NewReportRepository(db).Create(ctx, report); err != nil {
		t.Fatalf("create report: %v", err)
	}

	mb1 := seedMissionBank(db, program)
	mb2 := seedMissionBank(db, program)
	repo := NewParticipantMissionRepository(db)
	items := []entity.ParticipantMission{
		{ParticipantID: pid, ReportID: report.ID, MissionBankID: mb1, IsCompleted: true},
		{ParticipantID: pid, ReportID: report.ID, MissionBankID: mb2, IsCompleted: false},
	}
	if err := repo.ReplaceByReport(ctx, report.ID, items); err != nil {
		t.Fatalf("replace: %v", err)
	}
	got, err := repo.ListByParticipant(ctx, pid)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 participant missions after replace, got %d", len(got))
	}

	// Replace with a single item — the previous 2 must be gone.
	if err := repo.ReplaceByReport(ctx, report.ID, items[:1]); err != nil {
		t.Fatalf("replace again: %v", err)
	}
	got2, err := repo.ListByParticipant(ctx, pid)
	if err != nil {
		t.Fatalf("list2: %v", err)
	}
	if len(got2) != 1 {
		t.Fatalf("expected 1 participant mission after second replace, got %d", len(got2))
	}
}

// TestB16SessionCascade verifies deleting a session hard-deletes its child participants
// (FK ON DELETE CASCADE + Unscoped, plan B16).
func TestB16SessionCascade(t *testing.T) {
	db := openTestDB(t)
	tenant := seedTenant(db)
	user := seedUser(db, tenant)
	program := seedProgram(db, tenant)
	pid := seedParticipant(db, tenant)
	sid := seedSession(db, tenant, program, user)
	ctx := context.Background()

	// Parent the participant on the session so cascade can fire.
	if err := db.Model(&ParticipantModel{}).Where("id = ?", pid).
		Update("session_id", sid).Error; err != nil {
		t.Fatalf("link participant: %v", err)
	}

	repo := NewSessionRepository(db)
	if err := repo.DeleteSession(ctx, sid); err != nil {
		t.Fatalf("delete session: %v", err)
	}

	var cnt int64
	db.Raw("SELECT COUNT(*) FROM participants WHERE id = ?", pid).Scan(&cnt)
	if cnt != 0 {
		t.Fatalf("expected participant to be cascade-deleted with its session, got %d rows", cnt)
	}
}
