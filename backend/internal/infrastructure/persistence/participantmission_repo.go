package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormParticipantMissionRepository implements repository.ParticipantMissionRepository.
type GormParticipantMissionRepository struct {
	db         *gorm.DB
	reportRepo repository.ReportRepository
}

// NewParticipantMissionRepository builds a GORM-backed participant-mission repo.
// reportRepo is used to assert report ownership (tenant scoping) before any
// operation, keeping participant_missions 3NF off report_id with no tenant column.
func NewParticipantMissionRepository(db *gorm.DB, reportRepo repository.ReportRepository) repository.ParticipantMissionRepository {
	return &GormParticipantMissionRepository{db: db, reportRepo: reportRepo}
}

// assertReportOwnership verifies the report belongs to the caller's tenant.
// Returns 404 for cross-tenant or unknown reports (defense-in-depth).
func (r *GormParticipantMissionRepository) assertReportOwnership(ctx context.Context, tenantID, reportID string) error {
	if tenantID == "" {
		return apperrors.BadRequest("tenant_required", errors.New("tenant ID is required"))
	}
	if _, err := r.reportRepo.GetByID(ctx, reportID, tenantID); err != nil {
		return err
	}
	return nil
}

func (r *GormParticipantMissionRepository) Create(ctx context.Context, tenantID string, m *entity.ParticipantMission) error {
	if err := r.assertReportOwnership(ctx, tenantID, m.ReportID); err != nil {
		return err
	}
	mm := participantMissionModelFromEntity(m)
	if err := r.db.WithContext(ctx).Create(mm).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*m = *mm.ToEntity()
	return nil
}

func (r *GormParticipantMissionRepository) GetByID(ctx context.Context, tenantID, id string) (*entity.ParticipantMission, error) {
	var m ParticipantMissionModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	// Scope by report ownership before returning the row.
	if err := r.assertReportOwnership(ctx, tenantID, m.ReportID); err != nil {
		return nil, err
	}
	return m.ToEntity(), nil
}

func (r *GormParticipantMissionRepository) GetByReport(ctx context.Context, tenantID, reportID string) ([]entity.ParticipantMission, error) {
	if err := r.assertReportOwnership(ctx, tenantID, reportID); err != nil {
		return nil, err
	}
	var models []ParticipantMissionModel
	if err := r.db.WithContext(ctx).Where("report_id = ?", reportID).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.ParticipantMission, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

func (r *GormParticipantMissionRepository) Update(ctx context.Context, tenantID string, m *entity.ParticipantMission) error {
	if err := r.assertReportOwnership(ctx, tenantID, m.ReportID); err != nil {
		return err
	}
	mm := participantMissionModelFromEntity(m)
	if err := r.db.WithContext(ctx).Model(&ParticipantMissionModel{}).Where("id = ?", m.ID).Updates(mm).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormParticipantMissionRepository) Delete(ctx context.Context, tenantID, id string) error {
	var m ParticipantMissionModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperrors.NotFound("not_found", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	if err := r.assertReportOwnership(ctx, tenantID, m.ReportID); err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Delete(&ParticipantMissionModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// ReplaceByReport atomically replaces all participant missions for a report:
// deletes the existing rows and inserts the provided items within one transaction.
func (r *GormParticipantMissionRepository) ReplaceByReport(ctx context.Context, tenantID, reportID string, items []entity.ParticipantMission) error {
	if err := r.assertReportOwnership(ctx, tenantID, reportID); err != nil {
		return err
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().Where("report_id = ?", reportID).Delete(&ParticipantMissionModel{}).Error; err != nil {
			return apperrors.Internal("internal_error", err)
		}
		if len(items) == 0 {
			return nil
		}
		models := make([]ParticipantMissionModel, 0, len(items))
		for i := range items {
			models = append(models, *participantMissionModelFromEntity(&items[i]))
		}
		if err := tx.Create(&models).Error; err != nil {
			if isDuplicate(err) {
				return apperrors.Conflict("conflict", err)
			}
			return apperrors.Internal("internal_error", err)
		}
		return nil
	})
}

// ListByParticipant returns all participant missions for the given participant.
// participant_id is no longer stored on participant_missions (3NF); it is derived
// via the parent report (report_id -> reports.participant_id). Tenant scoping is
// enforced via the reports join (reports.session_id -> sessions.tenant_id),
// mirroring the ownership assertion used elsewhere.
func (r *GormParticipantMissionRepository) ListByParticipant(ctx context.Context, tenantID, participantID string) ([]entity.ParticipantMission, error) {
	if tenantID == "" {
		return nil, apperrors.BadRequest("tenant_required", errors.New("tenant ID is required"))
	}
	var models []ParticipantMissionModel
	if err := r.db.WithContext(ctx).
		Joins("JOIN reports r ON r.id = participant_missions.report_id").
		Where("r.participant_id = ? AND r.session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)", participantID, tenantID).
		Order("participant_missions.created_at DESC").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.ParticipantMission, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}
