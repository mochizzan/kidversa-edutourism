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

// GormProgramSubstageRepository implements repository.ProgramSubstageRepository.
type GormProgramSubstageRepository struct {
	db *gorm.DB
}

// NewProgramSubstageRepository builds a GORM-backed program-substage repository.
func NewProgramSubstageRepository(db *gorm.DB) repository.ProgramSubstageRepository {
	return &GormProgramSubstageRepository{db: db}
}

func (r *GormProgramSubstageRepository) CreateSubstage(ctx context.Context, s *entity.ProgramSubstage) error {
	m := programSubstageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*s = *m.ToEntity()
	return nil
}

func (r *GormProgramSubstageRepository) GetSubstageByID(ctx context.Context, id string) (*entity.ProgramSubstage, error) {
	var m ProgramSubstageModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormProgramSubstageRepository) ListSubstages(ctx context.Context, programStageID string) ([]entity.ProgramSubstage, error) {
	var models []ProgramSubstageModel
	if err := r.db.WithContext(ctx).
		Where("program_stage_id = ?", programStageID).
		Order("sequence_order ASC").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ProgramSubstage, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormProgramSubstageRepository) ListPaginatedSubstages(ctx context.Context, filter repository.SubstageFilter, page, limit int) (*repository.Paginated[entity.ProgramSubstage], error) {
	q := r.db.WithContext(ctx).Model(&ProgramSubstageModel{}).Joins("JOIN program_stages ps ON ps.id = program_substages.program_stage_id").Joins("JOIN programs p ON p.id = ps.program_id")
	if filter.ProgramStageID != "" {
		q = q.Where("program_substages.program_stage_id = ?", filter.ProgramStageID)
	}
	if filter.ProgramID != "" {
		q = q.Where("ps.program_id = ?", filter.ProgramID)
	}
	if filter.TenantID != "" {
		q = q.Where("p.tenant_id = ?", filter.TenantID)
	}
	if filter.Search != "" {
		like := "%" + strings.ToLower(filter.Search) + "%"
		q = q.Where("LOWER(program_substages.name) LIKE ? OR LOWER(program_substages.description) LIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	var models []ProgramSubstageModel
	offset := (page - 1) * limit
	if err := q.Order("program_substages.sequence_order ASC, program_substages.created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ProgramSubstage, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.ProgramSubstage]{Items: items, Total: int(total)}, nil
}

func (r *GormProgramSubstageRepository) UpdateSubstage(ctx context.Context, s *entity.ProgramSubstage) error {
	m := programSubstageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Model(&ProgramSubstageModel{}).Where("id = ?", s.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	// Denormalize: sync kegiatan_name in all assessments referencing this substage
	r.db.WithContext(ctx).Model(&AssessmentModel{}).Where("session_substage_id = ?", s.ID).Update("kegiatan_name", s.Name)
	return nil
}

func (r *GormProgramSubstageRepository) DeleteSubstage(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&ProgramSubstageModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// CountSubstageUsage counts live session_substages rows referencing the
// Kegiatan (default GORM scope excludes soft-deleted rows).
func (r *GormProgramSubstageRepository) CountSubstageUsage(ctx context.Context, substageID string) (int64, error) {
	var n int64
	if err := r.db.WithContext(ctx).Model(&SessionSubstageModel{}).Where("program_substage_id = ?", substageID).Count(&n).Error; err != nil {
		return 0, apperrors.Internal("internal_error", err)
	}
	return n, nil
}

// ListSubstageSessionBriefs returns up to limit live sessions using the
// Kegiatan (id, name, status), oldest first — the short list behind the 409.
func (r *GormProgramSubstageRepository) ListSubstageSessionBriefs(ctx context.Context, substageID string, limit int) ([]entity.Session, error) {
	q := r.db.WithContext(ctx).Table("sessions s").
		Select("s.*").
		Joins("JOIN session_substages ssub ON ssub.session_id = s.id").
		Where("ssub.program_substage_id = ?", substageID).
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

// GormSessionSubstageRepository implements repository.SessionSubstageRepository.
type GormSessionSubstageRepository struct {
	db *gorm.DB
}

// NewSessionSubstageRepository builds a GORM-backed session-substage repository.
func NewSessionSubstageRepository(db *gorm.DB) repository.SessionSubstageRepository {
	return &GormSessionSubstageRepository{db: db}
}

func (r *GormSessionSubstageRepository) CreateSessionSubstage(ctx context.Context, s *entity.SessionSubstage) error {
	m := sessionSubstageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*s = *m.ToEntity()
	return nil
}

func (r *GormSessionSubstageRepository) ListSessionSubstages(ctx context.Context, sessionID string) ([]entity.SessionSubstage, error) {
	var models []SessionSubstageModel
	if err := r.db.WithContext(ctx).
		Where("session_id = ?", sessionID).
		Order("created_at ASC").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.SessionSubstage, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionSubstageRepository) GetSessionSubstage(ctx context.Context, id string) (*entity.SessionSubstage, error) {
	var m SessionSubstageModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormSessionSubstageRepository) GetSessionSubstageByKeys(ctx context.Context, sessionID, programSubstageID string) (*entity.SessionSubstage, error) {
	var m SessionSubstageModel
	if err := r.db.WithContext(ctx).
		Where("session_id = ? AND program_substage_id = ?", sessionID, programSubstageID).
		First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormSessionSubstageRepository) UpdateSessionSubstage(ctx context.Context, s *entity.SessionSubstage) error {
	m := sessionSubstageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Model(&SessionSubstageModel{}).Where("id = ?", s.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormSessionSubstageRepository) CreateBadge(ctx context.Context, b *entity.ParticipantBadge) error {
	m := participantBadgeModelFromEntity(b)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*b = *m.ToEntity()
	return nil
}

func (r *GormSessionSubstageRepository) GetBadge(ctx context.Context, id string) (*entity.ParticipantBadge, error) {
	var m ParticipantBadgeModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

// ListBadgesByParticipant returns a participant's badges. When tenantID is
// non-empty the result is restricted to participants owned by that tenant
// (participant_badges carries no tenant_id, so the scope is resolved through
// participants); an empty tenantID keeps the legacy tenant-less path.
func (r *GormSessionSubstageRepository) ListBadgesByParticipant(ctx context.Context, participantID, tenantID string) ([]entity.ParticipantBadge, error) {
	var models []ParticipantBadgeModel
	q := r.db.WithContext(ctx).Where("participant_id = ?", participantID)
	if tenantID != "" {
		q = q.Where("participant_id IN (SELECT id FROM participants WHERE tenant_id = ?)", tenantID)
	}
	if err := q.
		Order("created_at ASC").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ParticipantBadge, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionSubstageRepository) ListBadgesByParticipantStage(ctx context.Context, participantID, programStageID string) ([]entity.ParticipantBadge, error) {
	var models []ParticipantBadgeModel
	if err := r.db.WithContext(ctx).
		Where("participant_id = ? AND program_stage_id = ? AND badge_type = ?", participantID, programStageID, entity.BadgeTypeTopik).
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ParticipantBadge, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionSubstageRepository) ListFinalBadgesByParticipant(ctx context.Context, participantID, programID string) ([]entity.ParticipantBadge, error) {
	var models []ParticipantBadgeModel
	if err := r.db.WithContext(ctx).
		Where("participant_id = ? AND program_id = ? AND badge_type = ?", participantID, programID, entity.BadgeTypeFinal).
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ParticipantBadge, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

// RevokeFinalBadge revokes the participant's FINAL badge(s) for a program by
// soft-deleting them (participant_badges carries no tenant_id; the scope
// mirrors ListFinalBadgesByParticipant — participant + program + badge_type).
// GORM's soft delete on DeletedAt stamps deleted_at and every list query stops
// returning the row; TOPIK rows are never touched. A no-op when no FINAL
// row exists; write failures surface as explicit internal errors.
func (r *GormSessionSubstageRepository) RevokeFinalBadge(ctx context.Context, participantID, programID string) error {
	if err := r.db.WithContext(ctx).
		Where("participant_id = ? AND program_id = ? AND badge_type = ?", participantID, programID, entity.BadgeTypeFinal).
		Delete(&ParticipantBadgeModel{}).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}
