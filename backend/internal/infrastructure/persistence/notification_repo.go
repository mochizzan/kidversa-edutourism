package persistence

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"

	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// NotificationModel is the GORM model for user notifications.
type NotificationModel struct {
	entity.Notification
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);index" json:"-"`
}

// TableName pins the table name.
func (NotificationModel) TableName() string { return "notifications" }

// BeforeCreate generates a UUID if missing.
func (m *NotificationModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	m.UpdatedAt = m.CreatedAt
	return nil
}

func (m *NotificationModel) ToEntity() *entity.Notification {
	e := m.Notification
	return &e
}

func notificationModelFromEntity(e *entity.Notification) *NotificationModel {
	return &NotificationModel{Notification: *e}
}

// GormNotificationRepository implements repository.NotificationRepository on GORM.
type GormNotificationRepository struct {
	db *gorm.DB
}

// NewNotificationRepository builds a GORM-backed notification repository.
func NewNotificationRepository(db *gorm.DB) repository.NotificationRepository {
	return &GormNotificationRepository{db: db}
}

func (r *GormNotificationRepository) Create(ctx context.Context, n *entity.Notification) error {
	m := notificationModelFromEntity(n)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*n = *m.ToEntity()
	return nil
}

func (r *GormNotificationRepository) ListByRecipient(ctx context.Context, userID, since string, limit int) ([]entity.Notification, error) {
	q := r.db.WithContext(ctx).Model(&NotificationModel{}).Where("recipient_user_id = ?", userID)
	if since != "" {
		q = q.Where("created_at > ?", since)
	}
	var models []NotificationModel
	if err := q.Order("created_at DESC").Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.Notification, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

func (r *GormNotificationRepository) CountUnread(ctx context.Context, userID string) (int64, error) {
	var n int64
	if err := r.db.WithContext(ctx).Model(&NotificationModel{}).
		Where("recipient_user_id = ? AND is_read = ?", userID, false).Count(&n).Error; err != nil {
		return 0, apperrors.Internal("internal_error", err)
	}
	return n, nil
}

func (r *GormNotificationRepository) MarkRead(ctx context.Context, id, userID string) error {
	res := r.db.WithContext(ctx).Model(&NotificationModel{}).
		Where("id = ? AND recipient_user_id = ?", id, userID).Update("is_read", true)
	if res.Error != nil {
		return apperrors.Internal("internal_error", res.Error)
	}
	if res.RowsAffected == 0 {
		return apperrors.NotFound("not_found", errors.New("no rows"))
	}
	return nil
}

func (r *GormNotificationRepository) MarkAllRead(ctx context.Context, userID string) error {
	if err := r.db.WithContext(ctx).Model(&NotificationModel{}).
		Where("recipient_user_id = ?", userID).Update("is_read", true).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}
