package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// ContentRepository is the persistence contract for the standalone contents
// table. Only the non-legacy surface is kept: badge/media/report upload and
// serving (Create/Get/Update + tenant fallback). The legacy content-manager
// (List/Delete/Usage) and the stage_contents junction (ListStageContents)
// were removed with the kiosk/learner + content-manager wave; the tables stay
// in the DB (no migration) but no code reads them.
type ContentRepository interface {
	// Content (standalone, tenant-scoped).
	CreateContent(ctx context.Context, c *entity.Content) error
	GetContentByID(ctx context.Context, id string) (*entity.Content, error)
	UpdateContent(ctx context.Context, c *entity.Content) error
	GetContentProgramTenant(ctx context.Context, contentID string) (string, error)
}
