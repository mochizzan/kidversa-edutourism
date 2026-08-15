package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ContentFilter narrows a tenant-wide Content list query.
type ContentFilter struct {
	TenantID string
	Search   string
	FileType string
}

// ContentRepository is the persistence contract for the standalone contents table
// and the stage_contents junction (Model A / single-source refactor).
//
// It was EXTRACTED out of ProgramRepository (CRIT-9, breaking change): content is
// no longer owned by a stage. The same instance is injected into ProgramHandler,
// MediaHandler, ContentHandler, and UploadHandler.
type ContentRepository interface {
	// Content (standalone, tenant-scoped).
	CreateContent(ctx context.Context, c *entity.Content) error
	GetContentByID(ctx context.Context, id string) (*entity.Content, error)
	ListContents(ctx context.Context, f ContentFilter, page, limit int) (*Paginated[entity.Content], error)
	UpdateContent(ctx context.Context, c *entity.Content) error
	// DeleteContent atomically drops the junctions then the content row, and
	// returns the stored file_url so the handler can remove the orphan file (D10a/E24).
	DeleteContent(ctx context.Context, id string) (string, error)

	// Junction (content <-> stage).
	AssignContentToStage(ctx context.Context, stageID, contentID string) error
	UnassignContentFromStage(ctx context.Context, stageID, contentID string) error
	ListStageContents(ctx context.Context, stageID string) ([]entity.StageContent, error)
	GetContentUsage(ctx context.Context, contentID string) ([]entity.ContentUsage, error)
	GetContentProgramTenant(ctx context.Context, contentID string) (string, error)
	ReorderStageContents(ctx context.Context, stageID string, orderedContentIDs []string) error
}
