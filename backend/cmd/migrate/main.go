package main

import (
	"log"
	"os"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/infrastructure/migration"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
)

// Bootstrap defaults used when seeding the database on first run. These are
// bootstrap-only values (not secrets); the super-admin password is overridable
// via BOOTSTRAP_SUPERADMIN_PASSWORD. Tenant slugs are stable identifiers used by
// the seed logic and by operations tooling.
const (
	bootstrapSuperadminEmail   = "superadmin@kidversa.id"
	bootstrapTenantBandungSlug = "tenant-bandung"
)

func main() {
	cfg := config.Load()

	migrationsDir := migrationsPath()
	if err := migration.Run(cfg, migrationsDir); err != nil {
		logMigrationFailure(err)
	}
	log.Println("schema migrated")

	if err := bootstrap(cfg); err != nil {
		log.Fatalf("bootstrap failed: %v", err)
	}
	log.Println("bootstrap complete")
}

// logMigrationFailure logs the migration error with an actionable recovery hint
// when the failure is a dirty schema version (which otherwise loops forever).
func logMigrationFailure(err error) {
	if err == nil {
		return
	}
	msg := err.Error()
	if strings.Contains(msg, "Dirty database") {
		log.Printf("migration failed: %v", err)
		log.Printf("RECOVERY: connect to the database and run: " +
			"UPDATE schema_migrations SET version=<completed_version>, dirty=false; " +
			"(or use `migrate force <version>`), then restart. " +
			"The hardened runner now also self-heals dirty state automatically.")
		log.Fatalf("migration failed (dirty database)")
	}
	log.Fatalf("migration failed: %v", err)
}

func migrationsPath() string {
	if p := os.Getenv("MIGRATIONS_DIR"); p != "" {
		return p
	}
	return "migrations"
}

func bootstrap(cfg *config.Config) error {
	db, err := persistence.OpenDB(cfg)
	if err != nil {
		return err
	}
	g := db.DB

	// Tenants (idempotent by slug).
	tenants := []entity.Tenant{
		{BaseModel: entity.BaseModel{ID: uuid.NewString()}, Name: "Tenant Bandung", Slug: bootstrapTenantBandungSlug},
	}
	for _, t := range tenants {
		var cnt int64
		g.Model(&entity.Tenant{}).Where("slug = ?", t.Slug).Count(&cnt)
		if cnt == 0 {
			if err := g.Create(&t).Error; err != nil {
				return err
			}
		}
	}

	// SUPER_ADMIN (global, no tenant). Password SELALU wajib di-set via env
	// (crash kalau kosong), tapi penimpaan DB hanya saat SUPERADMIN_FORCE_RESET=true.
	pw := cfg.BootstrapSuperadminPassword
	if pw == "" {
		log.Fatal("BOOTSTRAP: BOOTSTRAP_SUPERADMIN_PASSWORD wajib di-set (minimal 8 karakter)")
	}
	if len(pw) < 8 {
		log.Fatalf("BOOTSTRAP: BOOTSTRAP_SUPERADMIN_PASSWORD terlalu pendek (%d char, minimal 8)", len(pw))
	}
	superHash, err := auth.BcryptHash(pw, cfg.BcryptCost)
	if err != nil {
		return err
	}
	super := entity.User{
		BaseModel:          entity.BaseModel{ID: uuid.NewString()},
		TenantID:           nil,
		Email:              bootstrapSuperadminEmail,
		PasswordHash:       superHash,
		Name:               "Super Admin",
		Role:               entity.RoleSuperAdmin,
		IsActive:           true,
		ApprovalStatus:     entity.ApprovalApproved,
		MustChangePassword: true, // dipaksa ganti saat login pertama
	}
	if err := upsertUser(g, super, cfg.SuperadminForceReset); err != nil {
		return err
	}
	return nil
}

// upsertUser creates the user if absent. When a row with the same email already
// exists, it honors the DB state and does NOT overwrite the password — unless
// forceReset is true (recovery / forgotten-password flow). This prevents a
// routine re-migration from reverting an admin-changed password back to the env
// value.
func upsertUser(g *gorm.DB, u entity.User, forceReset bool) error {
	var existing entity.User
	if err := g.Where("email = ?", u.Email).First(&existing).Error; err == nil {
		if !forceReset {
			return nil
		}
		return g.Model(&existing).Update("password_hash", u.PasswordHash).Error
	}
	return g.Create(&u).Error
}
