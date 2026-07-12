package main

import (
	"log"
	"os"

	"github.com/google/uuid"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/infrastructure/migration"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
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
		{BaseModel: entity.BaseModel{ID: uuid.NewString()}, Name: "Tenant Bandung", Slug: "tenant-bandung"},
		{BaseModel: entity.BaseModel{ID: uuid.NewString()}, Name: "Tenant Subang", Slug: "tenant-subang"},
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
			if t.Slug == "tenant-bandung" {
				bandungID = existing.ID
			}
			continue
		}
		if t.Slug == "tenant-bandung" {
			bandungID = t.ID
		}
	}

	// SUPER_ADMIN (global, no tenant).
	pw := cfg.BootstrapSuperadminPassword
	if pw == "" {
		pw = "password123" // fallback; must_change_password=1 forces reset on first login
		log.Println("WARNING: using default bootstrap password; set BOOTSTRAP_SUPERADMIN_PASSWORD in production")
	}
	superHash, err := auth.BcryptHash(pw, cfg.BcryptCost)
	if err != nil {
		return err
	}
	super := entity.User{
		BaseModel:          entity.BaseModel{ID: uuid.NewString()},
		TenantID:           nil,
		Email:              "superadmin@kidversa.id",
		PasswordHash:       superHash,
		Name:               "Super Admin",
		Role:               entity.RoleSuperAdmin,
		IsActive:           true,
		ApprovalStatus:     entity.ApprovalApproved,
		MustChangePassword: true,
	}
	var scnt int64
	g.Model(&entity.User{}).Where("email = ?", super.Email).Count(&scnt)
	if scnt == 0 {
		if err := g.Create(&super).Error; err != nil {
			return err
		}
	}

	// ADMIN for tenant-bandung.
	adminHash, err := auth.BcryptHash(pw, cfg.BcryptCost)
	if err != nil {
		return err
	}
	admin := entity.User{
		BaseModel:          entity.BaseModel{ID: uuid.NewString()},
		TenantID:           &bandungID,
		Email:              "admin.bandung@kidversa.id",
		PasswordHash:       adminHash,
		Name:               "Admin Bandung",
		Role:               entity.RoleAdmin,
		IsActive:           true,
		ApprovalStatus:     entity.ApprovalApproved,
		MustChangePassword: true,
	}
	var acnt int64
	g.Model(&entity.User{}).Where("email = ?", admin.Email).Count(&acnt)
	if acnt == 0 {
		if err := g.Create(&admin).Error; err != nil {
			return err
		}
	}
	return nil
}
