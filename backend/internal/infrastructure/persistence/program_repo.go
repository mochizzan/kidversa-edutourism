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

// GormProgramRepository implements repository.ProgramRepository.
type GormProgramRepository struct {
	db *gorm.DB
}

// NewProgramRepository builds a GORM-backed program repository.
func NewProgramRepository(db *gorm.DB) repository.ProgramRepository {
	return &GormProgramRepository{db: db}
}

// --- Programs ---

func (r *GormProgramRepository) CreateProgram(ctx context.Context, p *entity.Program) error {
	m := programModelFromEntity(p)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*p = *m.ToEntity()
	return nil
}

func (r *GormProgramRepository) GetProgramByID(ctx context.Context, id string) (*entity.Program, error) {
	var m ProgramModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormProgramRepository) ListPrograms(ctx context.Context, f repository.ProgramFilter, page, limit int) (*repository.Paginated[entity.Program], error) {
	q := r.db.WithContext(ctx).Model(&ProgramModel{})
	if f.TenantID != "" {
		q = q.Where("tenant_id = ?", f.TenantID)
	}
	if f.IsActive != nil {
		q = q.Where("is_active = ?", *f.IsActive)
	}
	if f.Search != "" {
		like := "%" + strings.ToLower(f.Search) + "%"
		q = q.Where("LOWER(name) LIKE ? OR LOWER(description) LIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	var models []ProgramModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Program, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Program]{Items: items, Total: int(total)}, nil
}

func (r *GormProgramRepository) UpdateProgram(ctx context.Context, p *entity.Program) error {
	// Map-form update so zero/false/empty values are NOT skipped by GORM
	// (struct mode drops zero-values, breaking is_active=false and clearing
	// description).
	fields := map[string]interface{}{
		"name":                  p.Name,
		"description":           p.Description,
		"is_active":             p.IsActive,
		"final_badge_name":      p.FinalBadgeName,
		"final_badge_image_url": p.FinalBadgeImageURL,
	}
	if err := r.db.WithContext(ctx).Model(&ProgramModel{}).Where("id = ?", p.ID).Updates(fields).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	// Denormalize: sync program_name in all sessions referencing this program
	r.db.WithContext(ctx).Model(&SessionModel{}).Where("program_id = ?", p.ID).Update("program_name", p.Name)
	return nil
}

func (r *GormProgramRepository) DeleteProgram(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&ProgramModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormProgramRepository) CountProgramSessions(ctx context.Context, programID string) (int64, error) {
	// Default GORM scope = live (non soft-deleted) sessions, all statuses.
	var n int64
	if err := r.db.WithContext(ctx).Model(&SessionModel{}).Where("program_id = ?", programID).Count(&n).Error; err != nil {
		return 0, apperrors.Internal("internal_error", err)
	}
	return n, nil
}

func (r *GormProgramRepository) ListProgramSessionBriefs(ctx context.Context, programID string, limit int) ([]entity.Session, error) {
	q := r.db.WithContext(ctx).Model(&SessionModel{}).Where("program_id = ?", programID).Order("created_at ASC, id ASC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	var models []SessionModel
	if err := q.Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Session, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormProgramRepository) DeleteProgramForce(ctx context.Context, id string) error {
	// One transaction: purge every session of the program (incl. legacy
	// soft-deleted rows — hence Unscoped) together with its children, then
	// hard-delete the program so its FK cascades (sessions, program_stages,
	// mission_banks, participant_badges) fire on the physical row removal.
	// Children are purged per session FIRST because the no-FK tables
	// (group_stage_progress_history, timeline_events, gallery_tokens) are not
	// covered by any cascade.
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var ids []string
		if err := tx.Unscoped().Model(&SessionModel{}).Where("program_id = ?", id).Pluck("id", &ids).Error; err != nil {
			return apperrors.Internal("internal_error", err)
		}
		for _, sid := range ids {
			if err := purgeSessionRows(tx, sid); err != nil {
				return err
			}
		}
		if err := tx.Unscoped().Delete(&ProgramModel{}, "id = ?", id).Error; err != nil {
			return apperrors.Internal("internal_error", err)
		}
		return nil
	})
}

func (r *GormProgramRepository) ToggleActiveProgram(ctx context.Context, id string) (*entity.Program, error) {
	var m ProgramModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	m.IsActive = !m.IsActive
	if err := r.db.WithContext(ctx).Model(&ProgramModel{}).Where("id = ?", id).Update("is_active", m.IsActive).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

// --- Stages ---

func (r *GormProgramRepository) CreateStage(ctx context.Context, s *entity.ProgramStage) error {
	m := programStageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*s = *m.ToEntity()
	return nil
}

func (r *GormProgramRepository) GetStageByID(ctx context.Context, id string) (*entity.ProgramStage, error) {
	var m ProgramStageModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormProgramRepository) ListStages(ctx context.Context, programID string) ([]entity.ProgramStage, error) {
	var models []ProgramStageModel
	if err := r.db.WithContext(ctx).Where("program_id = ?", programID).Order("sequence_order ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ProgramStage, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormProgramRepository) ListPaginatedStages(ctx context.Context, filter repository.StageFilter, page, limit int) (*repository.Paginated[entity.ProgramStage], error) {
	q := r.db.WithContext(ctx).Model(&ProgramStageModel{}).Joins("JOIN programs p ON p.id = program_stages.program_id")
	if filter.ProgramID != "" {
		q = q.Where("program_stages.program_id = ?", filter.ProgramID)
	}
	if filter.TenantID != "" {
		q = q.Where("p.tenant_id = ?", filter.TenantID)
	}
	if filter.Search != "" {
		like := "%" + strings.ToLower(filter.Search) + "%"
		q = q.Where("LOWER(program_stages.name) LIKE ? OR LOWER(program_stages.description) LIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	var models []ProgramStageModel
	offset := (page - 1) * limit
	if err := q.Order("program_stages.sequence_order ASC, program_stages.created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ProgramStage, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.ProgramStage]{Items: items, Total: int(total)}, nil
}

func (r *GormProgramRepository) UpdateStage(ctx context.Context, s *entity.ProgramStage) error {
	// Map-form update so zero/false/empty values are not skipped by GORM and
	// dropped columns are not referenced.
	fields := map[string]interface{}{
		"sequence_order":  s.SequenceOrder,
		"name":            s.Name,
		"description":     s.Description,
		"content_type":    s.ContentType,
		"badge_name":      s.BadgeName,
		"badge_image_url": s.BadgeImageURL,
	}
	if err := r.db.WithContext(ctx).Model(&ProgramStageModel{}).Where("id = ?", s.ID).Updates(fields).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	// Denormalize: sync program_stage_name in all session_stages referencing this stage
	r.db.WithContext(ctx).Model(&SessionStageModel{}).Where("program_stage_id = ?", s.ID).Update("program_stage_name", s.Name)
	return nil
}

func (r *GormProgramRepository) DeleteStage(ctx context.Context, id string) error {
	// Hard delete in ONE transaction. Children with an FK to program_stages
	// (program_substages→session_substages, session_stages, mission_bank_stages,
	// participant_badges) cascade on the physical row removal; rows that carry
	// program_stage_id WITHOUT an FK (assessments, reports, report_photo_picks)
	// are purged manually so nothing keeps pointing at the deleted stage.
	// The old GORM soft delete left the row present, so no cascade ever fired.
	// Callers MUST run the CountStageUsage guard first: this body still purges
	// and cascades whenever it is invoked.
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, table := range []string{"assessments", "reports", "report_photo_picks"} {
			if err := tx.Exec("DELETE FROM "+table+" WHERE program_stage_id = ?", id).Error; err != nil {
				return apperrors.Internal("internal_error", err)
			}
		}
		if err := tx.Unscoped().Delete(&ProgramStageModel{}, "id = ?", id).Error; err != nil {
			return apperrors.Internal("internal_error", err)
		}
		return nil
	})
}

// CountStageUsage counts live rows still referencing the Topik: session
// instantiations (session_stages), cloned Kegiatan (session_substages via
// program_substages), scored assessments and reports. Default GORM scopes
// exclude soft-deleted rows.
func (r *GormProgramRepository) CountStageUsage(ctx context.Context, stageID string) (int64, error) {
	db := r.db.WithContext(ctx)
	var total int64
	var n int64
	if err := db.Model(&SessionStageModel{}).Where("program_stage_id = ?", stageID).Count(&n).Error; err != nil {
		return 0, apperrors.Internal("internal_error", err)
	}
	total += n
	n = 0
	if err := db.Table("session_substages ssub").
		Joins("JOIN program_substages psub ON psub.id = ssub.program_substage_id").
		Where("psub.program_stage_id = ?", stageID).
		Where("ssub.deleted_at IS NULL").
		Count(&n).Error; err != nil {
		return 0, apperrors.Internal("internal_error", err)
	}
	total += n
	n = 0
	if err := db.Model(&AssessmentModel{}).Where("program_stage_id = ?", stageID).Count(&n).Error; err != nil {
		return 0, apperrors.Internal("internal_error", err)
	}
	total += n
	n = 0
	if err := db.Model(&ReportModel{}).Where("program_stage_id = ?", stageID).Count(&n).Error; err != nil {
		return 0, apperrors.Internal("internal_error", err)
	}
	total += n
	return total, nil
}

// ListStageSessionBriefs returns up to limit live sessions instantiating the
// Topik (id, name, status), oldest first — the short list behind the 409.
func (r *GormProgramRepository) ListStageSessionBriefs(ctx context.Context, stageID string, limit int) ([]entity.Session, error) {
	q := r.db.WithContext(ctx).Table("sessions s").
		Select("s.*").
		Joins("JOIN session_stages st ON st.session_id = s.id").
		Where("st.program_stage_id = ?", stageID).
		Where("s.deleted_at IS NULL").
		Order("s.created_at ASC, s.id ASC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	var models []SessionModel
	if err := q.Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Session, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}
