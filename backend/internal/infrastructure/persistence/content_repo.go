package persistence

import (
	"context"
	"errors"

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

func (r *GormContentRepository) UpdateContent(ctx context.Context, c *entity.Content) error {
	m := contentModelFromEntity(c)
	// Update only the global content fields.
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

// GetContentProgramTenant resolves the owning tenant of a content via its stage's
// program. Empty string if the content is unassigned (no stage) — CRIT-6: an
// unassigned content has no tenant to scope and is not playable.
func (r *GormContentRepository) GetContentProgramTenant(ctx context.Context, contentID string) (string, error) {
	var tenantID string
	err := r.db.WithContext(ctx).
		Table("contents c").
		Select("COALESCE(p.tenant_id, '')").
		Joins("JOIN stage_contents sc ON sc.content_id = c.id").
		Joins("JOIN program_substages psub ON psub.id = sc.program_substage_id").
		Joins("JOIN program_stages ps ON ps.id = psub.program_stage_id").
		Joins("JOIN programs p ON p.id = ps.program_id").
		Where("c.id = ?", contentID).
		Limit(1).
		Scan(&tenantID).Error
	if err != nil {
		return "", apperrors.Internal("internal_error", err)
	}
	return tenantID, nil
}
