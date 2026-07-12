package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// MissionBankFilter narrows a mission-bank list query.
type MissionBankFilter struct {
	TenantID  string
	ProgramID string
	Category  string
	IsActive  *bool
}

// MissionBankRepository is the persistence contract for mission templates.
type MissionBankRepository interface {
	Create(ctx context.Context, m *entity.MissionBank) error
	GetByID(ctx context.Context, id string) (*entity.MissionBank, error)
	List(ctx context.Context, f MissionBankFilter, page, limit int) (*Paginated[entity.MissionBank], error)
	Update(ctx context.Context, m *entity.MissionBank) error
	Delete(ctx context.Context, id string) error
}

// FrameFilter narrows a photo-frame list query.
type FrameFilter struct {
	TenantID  string
	ProgramID string
	IsActive  *bool
}

// FrameRepository is the persistence contract for decorative photo frames.
type FrameRepository interface {
	Create(ctx context.Context, f *entity.PhotoFrame) error
	GetByID(ctx context.Context, id string) (*entity.PhotoFrame, error)
	List(ctx context.Context, f FrameFilter, page, limit int) (*Paginated[entity.PhotoFrame], error)
	Update(ctx context.Context, f *entity.PhotoFrame) error
	Delete(ctx context.Context, id string) error
}
