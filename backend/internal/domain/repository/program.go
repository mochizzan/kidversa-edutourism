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

// StageFilter narrows a paginated Topik list query. A non-empty TenantID
// scopes the result to programs owned by that tenant (Tahap 1 tenant
// isolation on the global /api/program-stages list).
type StageFilter struct {
	ProgramID string
	Search    string
	TenantID  string
}

// ProgramRepository is the persistence contract for programs (and their stages/contents).
type ProgramRepository interface {
	CreateProgram(ctx context.Context, p *entity.Program) error
	GetProgramByID(ctx context.Context, id string) (*entity.Program, error)
	ListPrograms(ctx context.Context, f ProgramFilter, page, limit int) (*Paginated[entity.Program], error)
	UpdateProgram(ctx context.Context, p *entity.Program) error
	DeleteProgram(ctx context.Context, id string) error
	// CountProgramSessions returns how many live sessions (all lifecycle
	// statuses) the program still owns — the guard behind
	// DELETE /api/programs/:id (409 program_has_sessions when > 0 without
	// ?force=true).
	CountProgramSessions(ctx context.Context, programID string) (int64, error)
	// ListProgramSessionBriefs returns up to limit live sessions of the program
	// (id, name, status) so the 409 can carry a short session list. The full
	// structured list is fetchable via GET /api/sessions?program_id=...
	ListProgramSessionBriefs(ctx context.Context, programID string, limit int) ([]entity.Session, error)
	// DeleteProgramForce hard-deletes the program together with ALL its
	// sessions and their children in one transaction — the ?force=true path of
	// DELETE /api/programs/:id.
	DeleteProgramForce(ctx context.Context, programID string) error
	ToggleActiveProgram(ctx context.Context, id string) (*entity.Program, error)

	CreateStage(ctx context.Context, s *entity.ProgramStage) error
	GetStageByID(ctx context.Context, id string) (*entity.ProgramStage, error)
	ListStages(ctx context.Context, programID string) ([]entity.ProgramStage, error)
	ListPaginatedStages(ctx context.Context, filter StageFilter, page, limit int) (*Paginated[entity.ProgramStage], error)
	UpdateStage(ctx context.Context, s *entity.ProgramStage) error
	DeleteStage(ctx context.Context, id string) error
	// CountStageUsage returns how many live rows still reference the Topik:
	// session instantiations (session_stages), cloned Kegiatan
	// (session_substages via program_substages), scored assessments and
	// reports. The guard behind DELETE .../stages/:stageId (409
	// stage_has_sessions when > 0).
	CountStageUsage(ctx context.Context, stageID string) (int64, error)
	// ListStageSessionBriefs returns up to limit live sessions that
	// instantiate the Topik (id, name, status) so the 409 can carry a short
	// session list.
	ListStageSessionBriefs(ctx context.Context, stageID string, limit int) ([]entity.Session, error)
}
