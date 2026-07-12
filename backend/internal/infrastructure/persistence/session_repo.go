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

// GormSessionRepository implements repository.SessionRepository.
type GormSessionRepository struct {
	db *gorm.DB
}

// NewSessionRepository builds a GORM-backed session repository.
func NewSessionRepository(db *gorm.DB) repository.SessionRepository {
	return &GormSessionRepository{db: db}
}

// Transaction runs fn inside a DB transaction, passing a repository bound to the tx.
func (r *GormSessionRepository) Transaction(ctx context.Context, fn func(tx repository.SessionRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&GormSessionRepository{db: tx})
	})
}

func (r *GormSessionRepository) CreateSession(ctx context.Context, s *entity.Session) error {
	m := sessionModelFromEntity(s)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*s = *m.ToEntity()
	return nil
}

func (r *GormSessionRepository) GetSessionByID(ctx context.Context, id string) (*entity.Session, error) {
	var m SessionModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormSessionRepository) ListSessions(ctx context.Context, f repository.SessionFilter, page, limit int) (*repository.Paginated[entity.Session], error) {
	q := r.db.WithContext(ctx).Model(&SessionModel{})
	if f.TenantID != "" {
		q = q.Where("tenant_id = ?", f.TenantID)
	}
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	if f.SessionDate != "" {
		q = q.Where("session_date = ?", f.SessionDate)
	}
	if f.Search != "" {
		like := "%" + strings.ToLower(f.Search) + "%"
		q = q.Where("LOWER(name) LIKE ? OR LOWER(location) LIKE ?", like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []SessionModel
	offset := (page - 1) * limit
	if err := q.Order("session_date DESC, created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Session, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Session]{Items: items, Total: int(total)}, nil
}

func (r *GormSessionRepository) UpdateSession(ctx context.Context, s *entity.Session) error {
	m := sessionModelFromEntity(s)
	if err := r.db.WithContext(ctx).Model(&SessionModel{}).Where("id = ?", s.ID).Updates(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormSessionRepository) DeleteSession(ctx context.Context, id string) error {
	// Hard delete so FK cascades (session_stages, session_groups, participants,
	// group_stage_progress, timeline_events) actually fire. GORM soft-delete leaves
	// the row present and the cascade never triggers, orphaning child rows.
	if err := r.db.WithContext(ctx).Unscoped().Delete(&SessionModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// --- Session stages ---

func (r *GormSessionRepository) CreateSessionStage(ctx context.Context, s *entity.SessionStage) error {
	m := sessionStageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*s = *m.ToEntity()
	return nil
}

func (r *GormSessionRepository) ListSessionStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error) {
	var models []SessionStageModel
	if err := r.db.WithContext(ctx).Where("session_id = ?", sessionID).Order("created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.SessionStage, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionRepository) UpdateSessionStage(ctx context.Context, s *entity.SessionStage) error {
	m := sessionStageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Model(&SessionStageModel{}).Where("id = ?", s.ID).Updates(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// --- Session groups ---

func (r *GormSessionRepository) CreateSessionGroup(ctx context.Context, g *entity.SessionGroup) error {
	m := sessionGroupModelFromEntity(g)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*g = *m.ToEntity()
	return nil
}

func (r *GormSessionRepository) GetSessionGroupByID(ctx context.Context, id string) (*entity.SessionGroup, error) {
	var m SessionGroupModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormSessionRepository) ListSessionGroups(ctx context.Context, sessionID string) ([]entity.SessionGroup, error) {
	var models []SessionGroupModel
	if err := r.db.WithContext(ctx).Where("session_id = ?", sessionID).Order("created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.SessionGroup, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionRepository) UpdateSessionGroup(ctx context.Context, g *entity.SessionGroup) error {
	m := sessionGroupModelFromEntity(g)
	if err := r.db.WithContext(ctx).Model(&SessionGroupModel{}).Where("id = ?", g.ID).Updates(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormSessionRepository) DeleteSessionGroup(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&SessionGroupModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// --- Group stage progress ---

func (r *GormSessionRepository) CreateGroupStageProgress(ctx context.Context, p *entity.GroupStageProgress) error {
	m := groupStageProgressModelFromEntity(p)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*p = *m.ToEntity()
	return nil
}

func (r *GormSessionRepository) ListGroupStageProgress(ctx context.Context, sessionStageID string) ([]entity.GroupStageProgress, error) {
	var models []GroupStageProgressModel
	if err := r.db.WithContext(ctx).Where("session_stage_id = ?", sessionStageID).Order("created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.GroupStageProgress, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

// --- Participants ---

func (r *GormSessionRepository) CreateParticipant(ctx context.Context, p *entity.Participant) error {
	m := participantModelFromEntity(p)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*p = *m.ToEntity()
	return nil
}

func (r *GormSessionRepository) GetParticipantByID(ctx context.Context, id string) (*entity.Participant, error) {
	var m ParticipantModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormSessionRepository) ListParticipants(ctx context.Context, sessionID, groupID string) ([]entity.Participant, error) {
	q := r.db.WithContext(ctx).Model(&ParticipantModel{})
	if sessionID != "" {
		q = q.Where("session_id = ?", sessionID)
	}
	if groupID != "" {
		q = q.Where("group_id = ?", groupID)
	}
	var models []ParticipantModel
	if err := q.Order("created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Participant, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

// ListParticipantsPaginated returns a tenant-scoped, paginated participant list
// (global /api/participants). Supports optional session_id/group_id filters and a
// case-insensitive search across child_name/parent_name/school_name.
func (r *GormSessionRepository) ListParticipantsPaginated(ctx context.Context, tenantID, sessionID, groupID, search string, page, limit int) (*repository.Paginated[entity.Participant], error) {
	q := r.db.WithContext(ctx).Model(&ParticipantModel{})
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	if sessionID != "" {
		q = q.Where("session_id = ?", sessionID)
	}
	if groupID != "" {
		q = q.Where("group_id = ?", groupID)
	}
	if search != "" {
		like := "%" + strings.ToLower(search) + "%"
		q = q.Where("LOWER(child_name) LIKE ? OR LOWER(parent_name) LIKE ? OR LOWER(school_name) LIKE ?", like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []ParticipantModel
	offset := (page - 1) * limit
	if err := q.Order("created_at ASC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Participant, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Participant]{Items: items, Total: int(total)}, nil
}

func (r *GormSessionRepository) UpdateParticipant(ctx context.Context, p *entity.Participant) error {
	m := participantModelFromEntity(p)
	if err := r.db.WithContext(ctx).Model(&ParticipantModel{}).Where("id = ?", p.ID).Updates(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormSessionRepository) DeleteParticipant(ctx context.Context, id string) error {
	// Guard: refuse to delete a participant that is still operationally linked or
	// has child records. This mirrors the frontend parity intent — a participant
	// that still carries session/group membership or assessment/photo/recording/
	// report/consent data must be unlinked/cleared first (or archived), not dropped
	// outright, to avoid dangling foreign keys and lost history.
	var p ParticipantModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperrors.NotFound("not_found", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	if p.SessionID != nil || p.GroupID != nil {
		return apperrors.Conflict("participant_not_deletable", nil)
	}
	// Count child rows referencing this participant across the content tables.
	// Tables created later (B15) are skipped gracefully until they exist.
	childTables := []struct {
		table string
		col   string
	}{
		{"participant_missions", "participant_id"},
		{"smart_photos", "participant_id"},
		{"recordings", "participant_id"},
		{"assessments", "participant_id"},
		{"reports", "participant_id"},
		{"consent_logs", "participant_id"},
	}
	for _, ct := range childTables {
		exists, err := tableExists(ctx, r.db, ct.table)
		if err != nil {
			return apperrors.Internal("internal_error", err)
		}
		if !exists {
			continue
		}
		var n int64
		if err := r.db.WithContext(ctx).Table(ct.table).Where(ct.col+" = ?", id).Count(&n).Error; err != nil {
			return apperrors.Internal("internal_error", err)
		}
		if n > 0 {
			return apperrors.Conflict("participant_not_deletable", nil)
		}
	}
	// Safe to soft-delete (auditable; matches existing behaviour otherwise).
	if err := r.db.WithContext(ctx).Delete(&ParticipantModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// tableExists reports whether a table is present in the current database.
func tableExists(ctx context.Context, db *gorm.DB, name string) (bool, error) {
	var cnt int64
	if err := db.WithContext(ctx).
		Table("information_schema.tables").
		Where("table_schema = DATABASE() AND table_name = ?", name).
		Count(&cnt).Error; err != nil {
		return false, err
	}
	return cnt > 0, nil
}
