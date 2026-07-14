package persistence

import (
	"os"
	"testing"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/config"
)

// openTestDB opens a *gorm.DB against the TEST_DB_* environment (or config defaults).
// It returns (nil, nil) when the test DB connection cannot be established so callers
// can t.Skip (per plan B20: tests SKIP if env empty / DB unavailable).
func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	cfg := &config.Config{
		TestDBHost:     getenv("TEST_DB_HOST", "127.0.0.1"),
		TestDBPort:     getenv("TEST_DB_PORT", "3306"),
		TestDBUser:     getenv("TEST_DB_USER", "root"),
		TestDBPassword: getenv("TEST_DB_PASSWORD", ""),
		TestDBName:     getenv("TEST_DB_NAME", "kidversa_test"),
	}
	dsn := cfg.TestDSN()
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Skipf("skipping integration test: cannot open test DB (set TEST_DB_* env): %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Skipf("skipping integration test: cannot access test DB pool: %v", err)
	}
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("skipping integration test: cannot ping test DB: %v", err)
	}
	return db
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func seedProgram(db *gorm.DB, tenantID string) string {
	pid := newUUID()
	if err := db.Exec("INSERT INTO programs (id, tenant_id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(3), NOW(3))", pid, tenantID, "Test Program").Error; err != nil {
		return ""
	}
	return pid
}

func seedFrame(db *gorm.DB, tenantID, programID string) string {
	fid := newUUID()
	if err := db.Exec("INSERT INTO photo_frames (id, tenant_id, program_id, name, file_url, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, NOW(3), NOW(3))",
		fid, tenantID, programID, "Test Frame", "/uploads/frame.png").Error; err != nil {
		return ""
	}
	return fid
}

func seedMissionBank(db *gorm.DB, tenantID, programID string) string {
	mid := newUUID()
	if err := db.Exec("INSERT INTO mission_banks (id, tenant_id, program_id, category, title_child, title_parent, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'HOME', 'Child', 'Parent', 1, 0, NOW(3), NOW(3))",
		mid, tenantID, programID).Error; err != nil {
		return ""
	}
	return mid
}
