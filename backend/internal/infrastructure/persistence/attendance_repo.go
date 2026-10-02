package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormAttendanceRepository implements repository.AttendanceRepository.
//
// Every lookup is keyed per peserta-per-topik: (participant_id, session_id,
// session_stage_id). A write to one Topik never touches another Topik's row —
// the upsert WHERE clause carries the full triple, so topic B cannot overwrite
// topic A for the same participant+session.
type GormAttendanceRepository struct {
	db *gorm.DB
}

// NewAttendanceRepository builds a GORM-backed attendance repository.
func NewAttendanceRepository(db *gorm.DB) *GormAttendanceRepository {
	return &GormAttendanceRepository{db: db}
}

// scopeAttendanceByTenant restricts the query to sessions owned by tenantID
// (empty tenantID skips the scope for tenant-less SUPER_ADMIN reads).
func scopeAttendanceByTenant(q *gorm.DB, tenantID string) *gorm.DB {
	if tenantID != "" {
		q = q.Where("session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)", tenantID)
	}
	return q
}

func (r *GormAttendanceRepository) GetByParticipantSessionStage(ctx context.Context, participantID, sessionID, sessionStageID, tenantID string) (*entity.ParticipantAttendance, error) {
	var m AttendanceModel
	q := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ? AND session_stage_id = ?", participantID, sessionID, sessionStageID)
	q = scopeAttendanceByTenant(q, tenantID)
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormAttendanceRepository) ListBySession(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantAttendance, error) {
	var models []AttendanceModel
	q := r.db.WithContext(ctx).Where("session_id = ?", sessionID)
	q = scopeAttendanceByTenant(q, tenantID)
	if err := q.Order("session_stage_id ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ParticipantAttendance, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormAttendanceRepository) ListBySessionStage(ctx context.Context, sessionID, sessionStageID, tenantID string) ([]entity.ParticipantAttendance, error) {
	var models []AttendanceModel
	q := r.db.WithContext(ctx).
		Where("session_id = ? AND session_stage_id = ?", sessionID, sessionStageID)
	q = scopeAttendanceByTenant(q, tenantID)
	if err := q.Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ParticipantAttendance, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormAttendanceRepository) ListByParticipantSession(ctx context.Context, participantID, sessionID, tenantID string) ([]entity.ParticipantAttendance, error) {
	var models []AttendanceModel
	q := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ?", participantID, sessionID)
	q = scopeAttendanceByTenant(q, tenantID)
	if err := q.Order("session_stage_id ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ParticipantAttendance, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormAttendanceRepository) Upsert(ctx context.Context, a *entity.ParticipantAttendance) error {
	m := attendanceModelFromEntity(a)
	err := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ? AND session_stage_id = ?", a.ParticipantID, a.SessionID, a.SessionStageID).
		Assign(map[string]interface{}{
			"is_present": a.IsPresent,
			"marked_at":  a.MarkedAt,
			"marked_by":  a.MarkedBy,
		}).
		FirstOrCreate(m).Error
	if err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*a = *m.ToEntity()
	return nil
}
