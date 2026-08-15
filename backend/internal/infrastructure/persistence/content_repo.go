package persistence

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormContentRepository implements repository.ContentRepository (Model A).
type GormContentRepository struct {
	db *gorm.DB
}

// NewContentRepository builds a GORM-backed content repository.
func NewContentRepository(db *gorm.DB) repository.ContentRepository {
	return &GormContentRepository{db: db}
}

// --- Content (standalone, tenant-scoped) ---

func (r *GormContentRepository) CreateContent(ctx context.Context, c *entity.Content) error {
	m := contentModelFromEntity(c)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*c = *m.ToEntity()
	return nil
}

func (r *GormContentRepository) GetContentByID(ctx context.Context, id string) (*entity.Content, error) {
	var m ContentModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormContentRepository) ListContents(ctx context.Context, f repository.ContentFilter, page, limit int) (*repository.Paginated[entity.Content], error) {
	q := r.db.WithContext(ctx).Model(&ContentModel{})
	if f.TenantID != "" {
		q = q.Where("tenant_id = ?", f.TenantID)
	}
	if f.FileType != "" {
		q = q.Where("file_type = ?", f.FileType)
	}
	if f.Search != "" {
		like := "%" + strings.ToLower(f.Search) + "%"
		q = q.Where("LOWER(title) LIKE ?", like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	var models []ContentModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Content, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Content]{Items: items, Total: int(total)}, nil
}

func (r *GormContentRepository) UpdateContent(ctx context.Context, c *entity.Content) error {
	m := contentModelFromEntity(c)
	// Update only the global content fields (per-stage state lives on the junction).
	if err := r.db.WithContext(ctx).Model(&ContentModel{}).Where("id = ?", c.ID).Updates(map[string]interface{}{
		"title":            m.Title,
		"file_url":         m.FileURL,
		"youtube_url":      m.YouTubeURL,
		"file_type":        m.FileType,
		"duration_seconds": m.DurationSeconds,
		"tenant_id":        m.TenantID,
	}).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// DeleteContent atomically removes the stage_contents junctions for the content
// (or relies on the FK cascade) and then the contents row, returning the stored
// file_url so the caller can remove the orphan file (D10a/E24). YouTube contents
// have an empty file_url, so the caller skips removal.
func (r *GormContentRepository) DeleteContent(ctx context.Context, id string) (string, error) {
	var m ContentModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", apperrors.NotFound("not_found", err)
		}
		return "", apperrors.Internal("internal_error", err)
	}
	fileURL := m.FileURL

	tx := r.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return "", apperrors.Internal("internal_error", tx.Error)
	}
	// Drop junctions first (also covered by FK ON DELETE CASCADE, but explicit for clarity/ordering).
	if err := tx.Where("content_id = ?", id).Delete(&StageContentRefModel{}).Error; err != nil {
		tx.Rollback()
		return "", apperrors.Internal("internal_error", err)
	}
	if err := tx.Where("id = ?", id).Delete(&ContentModel{}).Error; err != nil {
		tx.Rollback()
		return "", apperrors.Internal("internal_error", err)
	}
	if err := tx.Commit().Error; err != nil {
		return "", apperrors.Internal("internal_error", err)
	}
	return fileURL, nil
}

// --- Junction (content <-> stage) ---

func (r *GormContentRepository) AssignContentToStage(ctx context.Context, stageID, contentID string) error {
	ref := &entity.StageContentRef{
		ContentID:      contentID,
		ProgramStageID: stageID,
		SortOrder:      0,
		IsActive:       true,
	}
	m := stageContentRefModelFromEntity(ref)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			// A6a: one content at most once per stage. Idempotent: already added.
			return apperrors.Conflict("content_already_assigned", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormContentRepository) UnassignContentFromStage(ctx context.Context, stageID, contentID string) error {
	res := r.db.WithContext(ctx).
		Where("content_id = ? AND program_stage_id = ?", contentID, stageID).
		Delete(&StageContentRefModel{})
	if res.Error != nil {
		return apperrors.Internal("internal_error", res.Error)
	}
	// E12: idempotent — no-op if nothing matched.
	return nil
}

// ListStageContents returns the JOIN-shaped StageContent list for a stage,
// ordered by sort_order, filtering soft-deleted junctions (E22/CRIT-7).
func (r *GormContentRepository) ListStageContents(ctx context.Context, stageID string) ([]entity.StageContent, error) {
	type joinRow struct {
		ContentID      string
		ProgramStageID string
		SortOrder      int
		IsActive       bool
		Title          string
		FileURL        string
		YouTubeURL     string
		FileType       entity.StageContentFileType
		DurationSeconds int
		CreatedAt      interface{}
	}
	var rows []joinRow
	err := r.db.WithContext(ctx).
		Table("stage_contents sc").
		Select("sc.content_id, sc.program_stage_id, sc.sort_order, sc.is_active, c.title, c.file_url, c.youtube_url, c.file_type, c.duration_seconds, c.created_at").
		Joins("JOIN contents c ON c.id = sc.content_id").
		Where("sc.program_stage_id = ?", stageID).
		Order("sc.sort_order ASC").
		Find(&rows).Error
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.StageContent, 0, len(rows))
	for _, row := range rows {
		items = append(items, entity.StageContent{
			ID:             row.ContentID,
			ProgramStageID: row.ProgramStageID,
			Title:          row.Title,
			FileURL:        row.FileURL,
			YouTubeURL:     row.YouTubeURL,
			FileType:       row.FileType,
			DurationSeconds: row.DurationSeconds,
			SortOrder:      row.SortOrder,
			IsActive:       row.IsActive,
		})
	}
	return items, nil
}

// GetContentUsage returns every (program, stage) that references the content,
// for the Manager delete-confirm dialog (A3a).
func (r *GormContentRepository) GetContentUsage(ctx context.Context, contentID string) ([]entity.ContentUsage, error) {
	type usageRow struct {
		ProgramID   string
		ProgramName string
		StageID     string
		StageName   string
	}
	var rows []usageRow
	err := r.db.WithContext(ctx).
		Table("stage_contents sc").
		Select("p.id AS program_id, p.name AS program_name, ps.id AS stage_id, ps.name AS stage_name").
		Joins("JOIN program_stages ps ON ps.id = sc.program_stage_id").
		Joins("JOIN programs p ON p.id = ps.program_id").
		Where("sc.content_id = ?", contentID).
		Order("p.name ASC, ps.name ASC").
		Find(&rows).Error
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ContentUsage, 0, len(rows))
	for _, row := range rows {
		items = append(items, entity.ContentUsage{
			ProgramID:   row.ProgramID,
			ProgramName: row.ProgramName,
			StageID:     row.StageID,
			StageName:   row.StageName,
		})
	}
	return items, nil
}

// GetContentProgramTenant resolves the owning tenant of a content via its stage's
// program. Empty string if the content is unassigned (no stage) — CRIT-6: an
// unassigned content has no tenant to scope and is not playable.
func (r *GormContentRepository) GetContentProgramTenant(ctx context.Context, contentID string) (string, error) {
	var tenantID string
	err := r.db.WithContext(ctx).
		Table("contents c").
		Select("COALESCE(p.tenant_id, '')").
		Joins("JOIN stage_contents sc ON sc.content_id = c.id").
		Joins("JOIN program_stages ps ON ps.id = sc.program_stage_id").
		Joins("JOIN programs p ON p.id = ps.program_id").
		Where("c.id = ?", contentID).
		Limit(1).
		Scan(&tenantID).Error
	if err != nil {
		return "", apperrors.Internal("internal_error", err)
	}
	return tenantID, nil
}

// ReorderStageContents renumbers sort_order 1..n for the given content ids,
// matching on content_id (the junction PK — CRIT-11), not a separate id column.
func (r *GormContentRepository) ReorderStageContents(ctx context.Context, _ string, orderedContentIDs []string) error {
	return r.reorderByContentID(ctx, orderedContentIDs)
}

// reorderByContentID updates sort_order of junction rows to match orderedContentIDs
// (1-based sequence), keyed on content_id (the PK).
func (r *GormContentRepository) reorderByContentID(ctx context.Context, orderedContentIDs []string) error {
	tx := r.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return apperrors.Internal("internal_error", tx.Error)
	}
	for i, id := range orderedContentIDs {
		if err := tx.Model(&StageContentRefModel{}).Where("content_id = ?", id).Update("sort_order", i+1).Error; err != nil {
			tx.Rollback()
			return apperrors.Internal("internal_error", err)
		}
	}
	if err := tx.Commit().Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}
