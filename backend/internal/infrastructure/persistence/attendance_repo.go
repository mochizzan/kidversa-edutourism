package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormAttendanceRepository implements repository.AttendanceRepository.
type GormAttendanceRepository struct {
	db *gorm.DB
}

// NewAttendanceRepository builds a GORM-backed attendance repository.
func NewAttendanceRepository(db *gorm.DB) *GormAttendanceRepository {
	return &GormAttendanceRepository{db: db}
}

func (r *GormAttendanceRepository) GetByParticipantSession(ctx context.Context, participantID, sessionID, tenantID string) (*entity.ParticipantAttendance, error) {
	var m AttendanceModel
	q := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ?", participantID, sessionID)
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

func (r *GormAttendanceRepository) ListBySession(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantAttendance, error) {
	var models []AttendanceModel
	q := r.db.WithContext(ctx).Where("session_id = ?", sessionID)
	if tenantID != "" {
		q = q.Where("session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)", tenantID)
	}
	if err := q.Find(&models).Error; err != nil {
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
		Where("participant_id = ? AND session_id = ?", a.ParticipantID, a.SessionID).
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

func (r *GormAttendanceRepository) BulkUpsert(ctx context.Context, items []entity.ParticipantAttendance) error {
	if len(items) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			m := attendanceModelFromEntity(&item)
			err := tx.
				Where("participant_id = ? AND session_id = ?", item.ParticipantID, item.SessionID).
				Assign(map[string]interface{}{
					"is_present": item.IsPresent,
					"marked_at":  item.MarkedAt,
					"marked_by":  item.MarkedBy,
				}).
				FirstOrCreate(m).Error
			if err != nil {
				return apperrors.Internal("internal_error", err)
			}
		}
		return nil
	})
}
