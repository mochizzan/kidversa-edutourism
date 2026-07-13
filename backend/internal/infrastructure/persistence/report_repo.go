package persistence

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormReportRepository implements repository.ReportRepository.
type GormReportRepository struct {
	db *gorm.DB
}

// NewReportRepository builds a GORM-backed report repository.
func NewReportRepository(db *gorm.DB) repository.ReportRepository {
	return &GormReportRepository{db: db}
}

func (r *GormReportRepository) Create(ctx context.Context, rep *entity.Report) error {
	m := reportModelFromEntity(rep)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*rep = *m.ToEntity()
	return nil
}

func (r *GormReportRepository) GetByID(ctx context.Context, id, tenantID string) (*entity.Report, error) {
	var m ReportModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: restrict to the report's owning session's tenant (joined
	// via sessions) unless tenantID is empty (tenant-less SUPER_ADMIN).
	if tenantID != "" {
		q = q.Where("session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)", tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

// GetByToken resolves a report only if the parent token is valid: present,
// not revoked, and not expired. Anti-IDOR: the token is unguessable (64hex).
func (r *GormReportRepository) GetByToken(ctx context.Context, token string) (*entity.Report, error) {
	var m ReportModel
	if err := r.db.WithContext(ctx).Where("parent_access_token = ?", token).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("token_invalid", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	if m.ParentTokenRevoked {
		return nil, apperrors.Forbidden("token_invalid", errors.New("token revoked"))
	}
	if m.ParentTokenExpiresAt != nil {
		exp, err := time.Parse(time.RFC3339, *m.ParentTokenExpiresAt)
		if err == nil && time.Now().After(exp) {
			return nil, apperrors.Forbidden("token_expired", errors.New("token expired"))
		}
	}
	return m.ToEntity(), nil
}

func (r *GormReportRepository) List(ctx context.Context, f repository.ReportFilter, page, limit int) (*repository.Paginated[entity.Report], error) {
	q := r.db.WithContext(ctx).Model(&ReportModel{})
	if f.ParticipantID != "" {
		q = q.Where("participant_id = ?", f.ParticipantID)
	}
	if f.SessionID != "" {
		q = q.Where("session_id = ?", f.SessionID)
	}
	if f.TenantID != "" {
		q = q.Where("session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)", f.TenantID)
	}
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []ReportModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Report, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Report]{Items: items, Total: int(total)}, nil
}

func (r *GormReportRepository) Update(ctx context.Context, rep *entity.Report) error {
	m := reportModelFromEntity(rep)
	if err := r.db.WithContext(ctx).Model(&ReportModel{}).Where("id = ?", rep.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormReportRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&ReportModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}
