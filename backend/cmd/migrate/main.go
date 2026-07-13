package main

import (
	"log"
	"os"

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
	bootstrapSuperadminEmail = "superadmin@kidversa.id"
	bootstrapAdminBandungEmail = "admin.bandung@kidversa.id"
	bootstrapTenantBandungSlug = "tenant-bandung"
	bootstrapTenantSubangSlug  = "tenant-subang"
)

func main() {
	cfg := config.Load()

	migrationsDir := migrationsPath()
	if err := migration.Run(cfg, migrationsDir); err != nil {
		log.Fatalf("migration failed: %v", err)
	}
	log.Println("schema migrated")

	if err := bootstrap(cfg); err != nil {
		log.Fatalf("bootstrap failed: %v", err)
	}
	log.Println("bootstrap complete")
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
	bandungID := ""
	tenants := []entity.Tenant{
		{BaseModel: entity.BaseModel{ID: uuid.NewString()}, Name: "Tenant Bandung", Slug: bootstrapTenantBandungSlug},
		{BaseModel: entity.BaseModel{ID: uuid.NewString()}, Name: "Tenant Subang", Slug: bootstrapTenantSubangSlug},
	}
	for _, t := range tenants {
		var cnt int64
		g.Model(&entity.Tenant{}).Where("slug = ?", t.Slug).Count(&cnt)
		if cnt == 0 {
			if err := g.Create(&t).Error; err != nil {
				return err
			}
		} else {
			var existing entity.Tenant
			g.Where("slug = ?", t.Slug).First(&existing)
			if t.Slug == bootstrapTenantBandungSlug {
				bandungID = existing.ID
			}
			continue
		}
		if t.Slug == bootstrapTenantBandungSlug {
			bandungID = t.ID
		}
	}

	// SUPER_ADMIN (global, no tenant). Default ke "Password123" bila env kosong
	// atau terlalu pendek (mis. "123456" lama yang ditolak validasi FE min=8).
	pw := cfg.BootstrapSuperadminPassword
	if pw == "" || len(pw) < 8 {
		pw = "Password123"
		log.Println("BOOTSTRAP: BOOTSTRAP_SUPERADMIN_PASSWORD kosong/pendek, menggunakan default 'Password123'")
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
		MustChangePassword: false,
	}
	if err := upsertUser(g, super); err != nil {
		return err
	}

	// ADMIN for tenant-bandung.
	adminHash, err := auth.BcryptHash(pw, cfg.BcryptCost)
	if err != nil {
		return err
	}
	admin := entity.User{
		BaseModel:          entity.BaseModel{ID: uuid.NewString()},
		TenantID:           &bandungID,
		Email:              bootstrapAdminBandungEmail,
		PasswordHash:       adminHash,
		Name:               "Admin Bandung",
		Role:               entity.RoleAdmin,
		IsActive:           true,
		ApprovalStatus:     entity.ApprovalApproved,
		MustChangePassword: false,
	}
	if err := upsertUser(g, admin); err != nil {
		return err
	}
	return nil
}

// upsertUser creates the user if absent, or updates the password + core
// identity fields when a row with the same email already exists — so a
// changed bootstrap password takes effect on re-run without dropping the row.
func upsertUser(g *gorm.DB, u entity.User) error {
	var existing entity.User
	if err := g.Where("email = ?", u.Email).First(&existing).Error; err == nil {
		return g.Model(&existing).Updates(map[string]interface{}{
			"password_hash":       u.PasswordHash,
			"name":                u.Name,
			"is_active":           u.IsActive,
			"approval_status":     u.ApprovalStatus,
			"role":                u.Role,
			"must_change_password": u.MustChangePassword,
		}).Error
	}
	return g.Create(&u).Error
}
