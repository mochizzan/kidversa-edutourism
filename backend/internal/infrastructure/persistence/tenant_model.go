package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// TenantModel is the GORM persistence model for tenants. It embeds the domain
// entity and adds soft-delete + audit fields.
type TenantModel struct {
	entity.Tenant
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (TenantModel) TableName() string { return "tenants" }

// BeforeCreate generates a UUID if missing.
func (m *TenantModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	m.UpdatedAt = m.CreatedAt
	return nil
}

// ToEntity maps the model back to the domain entity.
func (m *TenantModel) ToEntity() *entity.Tenant {
	e := m.Tenant
	return &e
}

// tenantModelFromEntity builds a model from a domain entity.
func tenantModelFromEntity(e *entity.Tenant) *TenantModel {
	return &TenantModel{Tenant: *e}
}
