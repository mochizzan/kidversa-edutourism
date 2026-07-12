package persistence

import (
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// UserModel is the GORM persistence model for users. It embeds the domain entity
// and adds soft-delete + audit fields. Note: password_hash stays json:"-" via the entity.
type UserModel struct {
	entity.User
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name (plural snake_case per schema convention).
func (UserModel) TableName() string { return "users" }

// BeforeCreate generates a UUID if missing.
func (m *UserModel) BeforeCreate(*gorm.DB) error {
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
func (m *UserModel) ToEntity() *entity.User {
	e := m.User
	return &e
}

// userModelFromEntity builds a model from a domain entity.
func userModelFromEntity(e *entity.User) *UserModel {
	return &UserModel{User: *e}
}
