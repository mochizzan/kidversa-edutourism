package persistence

import (
	"context"
	"database/sql"
	"errors"
	"log"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormAssessmentRepository implements repository.AssessmentRepository.
type GormAssessmentRepository struct {
	db *gorm.DB
}

// NewAssessmentRepository builds a GORM-backed assessment repository.
func NewAssessmentRepository(db *gorm.DB) repository.AssessmentRepository {
	return &GormAssessmentRepository{db: db}
}

func (r *GormAssessmentRepository) Create(ctx context.Context, a *entity.Assessment) error {
	// Resolve the denormalized Topic keys (migration 000010): ONE lookup
	// session_substages -> session_stages yields BOTH scoping columns
	// (session_stage_id + program_stage_id) that feed report/badge scoping.
	// A query FAILURE is returned as an explicit internal error (never
	// log-swallowed: a failed write here would silently break per-Topic
	// scoping); a missing row or empty stage ids leaves the '' sentinel for
	// both columns (mirrors the kegiatan_name precedent below — no fabrication).
	if a.SessionStageID == "" && a.SessionSubstageID != "" {
		var keys struct {
			SessionStageID string `gorm:"column:session_stage_id"`
			ProgramStageID string `gorm:"column:program_stage_id"`
		}
		if err := r.db.WithContext(ctx).
			Table("session_substages AS ssub").
			Select("ssub.session_stage_id, ss.program_stage_id").
			Joins("JOIN session_stages ss ON ss.id = ssub.session_stage_id").
			Where("ssub.id = ?", a.SessionSubstageID).
			Scan(&keys).Error; err != nil {
			return apperrors.Internal("internal_error", err)
		}
		if keys.SessionStageID == "" || keys.ProgramStageID == "" {
			log.Printf("assessments: resolve topic keys skipped for session_substage %s: session_stage_id=%q program_stage_id=%q (left as '' sentinel)", a.SessionSubstageID, keys.SessionStageID, keys.ProgramStageID)
		} else {
			a.SessionStageID = keys.SessionStageID
			a.ProgramStageID = keys.ProgramStageID
		}
	}
	// Denormalize: fetch participant name and kegiatan name if not set.
	// Kegiatan names live on program_substages.name (session_substages has NO
	// name column), so resolve via session_substages.program_substage_id.
	if a.ParticipantName == "" && a.ParticipantID != "" {
		var name string
		if err := r.db.WithContext(ctx).Model(&ParticipantModel{}).Select("child_name").Where("id = ?", a.ParticipantID).Scan(&name).Error; err != nil {
			log.Printf("assessments: denormalize participant_name failed for participant %s: %v", a.ParticipantID, err)
		} else {
			a.ParticipantName = name
		}
	}
	if a.KegiatanName == "" && a.SessionSubstageID != "" {
		var programSubstageID string
		if err := r.db.WithContext(ctx).Model(&SessionSubstageModel{}).Select("program_substage_id").Where("id = ?", a.SessionSubstageID).Scan(&programSubstageID).Error; err != nil {
			log.Printf("assessments: denormalize kegiatan_name lookup session_substage %s failed: %v", a.SessionSubstageID, err)
		} else if programSubstageID == "" {
			log.Printf("assessments: denormalize kegiatan_name skipped for session_substage %s: no program_substage linked", a.SessionSubstageID)
		} else {
			var name string
			if err := r.db.WithContext(ctx).Model(&ProgramSubstageModel{}).Select("name").Where("id = ?", programSubstageID).Scan(&name).Error; err != nil {
				log.Printf("assessments: denormalize kegiatan_name lookup program_substage %s failed: %v", programSubstageID, err)
			} else if name == "" {
				log.Printf("assessments: denormalize kegiatan_name skipped for session_substage %s: program_substage %s has empty name", a.SessionSubstageID, programSubstageID)
			} else {
				a.KegiatanName = name
			}
		}
	}
	m := assessmentModelFromEntity(a)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		if isSchemaDrift(err) {
			log.Printf("schema_drift: assessments: %v", err)
			return apperrors.Internal("schema_drift", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*a = *m.ToEntity()
	return nil
}

func (r *GormAssessmentRepository) GetByID(ctx context.Context, id, tenantID string) (*entity.Assessment, error) {
	var m AssessmentModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: restrict to the assessment's owning session's tenant (joined
	// via sessions) unless tenantID is empty (tenant-less SUPER_ADMIN).
	if tenantID != "" {
		q = scopeByTenant(q, tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormAssessmentRepository) GetByParticipantStage(ctx context.Context, participantID, sessionSubstageID, tenantID string) (*entity.Assessment, error) {
	var m AssessmentModel
	q := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_substage_id = ?", participantID, sessionSubstageID)
	// Tenant scoping: restrict to the assessment's owning session's tenant (joined
	// via sessions) unless tenantID is empty (tenant-less SUPER_ADMIN).
	if tenantID != "" {
		q = scopeByTenant(q, tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		if isSchemaDrift(err) {
			log.Printf("schema_drift: assessments: %v", err)
			return nil, apperrors.Internal("schema_drift", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormAssessmentRepository) GetByParticipantStageIncludingDeleted(ctx context.Context, participantID, sessionSubstageID, tenantID string) (*entity.Assessment, error) {
	var m AssessmentModel
	q := r.db.WithContext(ctx).Unscoped().
		Where("participant_id = ? AND session_substage_id = ?", participantID, sessionSubstageID)
	// Tenant scoping: restrict to the assessment's owning session's tenant (joined
	// via sessions) unless tenantID is empty (tenant-less SUPER_ADMIN).
	if tenantID != "" {
		q = scopeByTenant(q, tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		if isSchemaDrift(err) {
			log.Printf("schema_drift: assessments: %v", err)
			return nil, apperrors.Internal("schema_drift", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormAssessmentRepository) List(ctx context.Context, f repository.AssessmentFilter, page, limit int) (*repository.Paginated[entity.Assessment], error) {
	q := r.db.WithContext(ctx).Model(&AssessmentModel{})
	if f.ParticipantID != "" {
		q = q.Where("participant_id = ?", f.ParticipantID)
	}
	if f.SessionID != "" {
		q = q.Where("assessments.session_id = ?", f.SessionID)
	}
	if f.SessionSubstageID != "" {
		q = q.Where("session_substage_id = ?", f.SessionSubstageID)
	}
	if len(f.SessionSubstageIDs) > 0 {
		q = q.Where("session_substage_id IN ?", f.SessionSubstageIDs)
	}
	// Per-Topic scoping: direct equality on the denormalized columns
	// (migration 000010) — no JOINs, so the tenant scope below always applies
	// to the base table with no ambiguous columns. Per-Topic scoping prevents
	// cross-topic leakage in report reads.
	if f.SessionStageID != "" {
		q = q.Where("assessments.session_stage_id = ?", f.SessionStageID)
	}
	if f.ProgramStageID != "" {
		q = q.Where("assessments.program_stage_id = ?", f.ProgramStageID)
	}
	// Tenant scoping (cross-tenant READ IDOR defense): scope to the tenant owning
	// the assessment's session. Empty TenantID is rejected as a required scope.
	if f.TenantID == "" {
		return nil, apperrors.BadRequest("tenant_required", errors.New("tenant ID is required"))
	}
	q = scopeByTenant(q, f.TenantID)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		if isSchemaDrift(err) {
			log.Printf("schema_drift: assessments: %v", err)
			return nil, apperrors.Internal("schema_drift", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}

	var models []AssessmentModel
	if err := paginate(q, page, limit, "created_at DESC").Find(&models).Error; err != nil {
		if isSchemaDrift(err) {
			log.Printf("schema_drift: assessments: %v", err)
			return nil, apperrors.Internal("schema_drift", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Assessment, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Assessment]{Items: items, Total: int(total)}, nil
}

func (r *GormAssessmentRepository) Update(ctx context.Context, a *entity.Assessment) error {
	// Map form so zero/false/empty values are NOT skipped by GORM (struct mode
	// drops zero-values, breaking star_rating=0 and empty comment).
	fields := map[string]interface{}{
		"participant_id":      a.ParticipantID,
		"session_id":          a.SessionID,
		"session_substage_id": a.SessionSubstageID,
		"session_stage_id":    a.SessionStageID,
		"program_stage_id":    a.ProgramStageID,
		"star_rating":         a.StarRating,
		"comment":             a.Comment,
		"assessed_by":         a.AssessedBy,
		"assessed_at":         a.AssessedAt,
	}
	if err := r.db.WithContext(ctx).Model(&AssessmentModel{}).Where("id = ?", a.ID).Updates(fields).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		if isSchemaDrift(err) {
			log.Printf("schema_drift: assessments: %v", err)
			return apperrors.Internal("schema_drift", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormAssessmentRepository) Revive(ctx context.Context, a *entity.Assessment) error {
	// Map form so zero/false/empty values are NOT skipped by GORM. Setting
	// deleted_at = NULL lifts the soft-delete, restoring the row to active state.
	fields := map[string]interface{}{
		"participant_id":      a.ParticipantID,
		"session_id":          a.SessionID,
		"session_substage_id": a.SessionSubstageID,
		"session_stage_id":    a.SessionStageID,
		"program_stage_id":    a.ProgramStageID,
		"star_rating":         a.StarRating,
		"comment":             a.Comment,
		"assessed_by":         a.AssessedBy,
		"assessed_at":         a.AssessedAt,
		"deleted_at":          nil,
	}
	if err := r.db.WithContext(ctx).Model(&AssessmentModel{}).Where("id = ?", a.ID).Updates(fields).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		if isSchemaDrift(err) {
			log.Printf("schema_drift: assessments: %v", err)
			return apperrors.Internal("schema_drift", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// GetGroupFacilitatorIDByParticipant resolves the facilitator_id of the group a
// participant belongs to (participants.group_id -> session_groups.facilitator_id).
// Returns nil if the participant has no group or the group has no facilitator.
func (r *GormAssessmentRepository) GetGroupFacilitatorIDByParticipant(ctx context.Context, participantID string) (*string, error) {
	var fid sql.NullString
	if err := r.db.WithContext(ctx).
		Table("participants AS p").
		Select("sg.facilitator_id").
		Joins("LEFT JOIN session_groups AS sg ON sg.id = p.group_id").
		Where("p.id = ?", participantID).
		Limit(1).
		Scan(&fid).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	if !fid.Valid || fid.String == "" {
		return nil, nil
	}
	v := fid.String
	return &v, nil
}
