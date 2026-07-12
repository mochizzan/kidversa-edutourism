package entity

import "time"

// BaseModel is the framework-agnostic base embedded by every domain entity.
// It contains NO gorm import by design (clean architecture): persistence models
// embed this struct and add GORM-specific fields (soft-delete, hooks) separately.
type BaseModel struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
