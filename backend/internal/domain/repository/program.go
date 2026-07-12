package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ProgramFilter narrows a program list query.
type ProgramFilter struct {
	TenantID string
	IsActive *bool
	Search   string
}

// ProgramRepository is the persistence contract for programs (and their stages/contents).
type ProgramRepository interface {
	CreateProgram(ctx context.Context, p *entity.Program) error
	GetProgramByID(ctx context.Context, id string) (*entity.Program, error)
	ListPrograms(ctx context.Context, f ProgramFilter, page, limit int) (*Paginated[entity.Program], error)
	UpdateProgram(ctx context.Context, p *entity.Program) error
	DeleteProgram(ctx context.Context, id string) error
	ToggleActiveProgram(ctx context.Context, id string) (*entity.Program, error)

	CreateStage(ctx context.Context, s *entity.ProgramStage) error
	GetStageByID(ctx context.Context, id string) (*entity.ProgramStage, error)
	ListStages(ctx context.Context, programID string) ([]entity.ProgramStage, error)
	UpdateStage(ctx context.Context, s *entity.ProgramStage) error
	DeleteStage(ctx context.Context, id string) error
	ReorderStages(ctx context.Context, programID string, orderedIDs []string) error

	CreateContent(ctx context.Context, c *entity.StageContent) error
	GetContentByID(ctx context.Context, id string) (*entity.StageContent, error)
	ListContents(ctx context.Context, stageID string) ([]entity.StageContent, error)
	UpdateContent(ctx context.Context, c *entity.StageContent) error
	DeleteContent(ctx context.Context, id string) error
	ReorderContents(ctx context.Context, stageID string, orderedIDs []string) error
}
