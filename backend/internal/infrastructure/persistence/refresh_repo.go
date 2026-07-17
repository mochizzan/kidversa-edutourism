package persistence

import (
	"context"
	"log"
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/infrastructure/auth"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// RefreshTokenModel is the GORM model for opaque refresh tokens (rotation, 1-use).
type RefreshTokenModel struct {
	ID        string         `gorm:"type:char(36);primaryKey"`
	UserID    string         `gorm:"type:char(36);column:user_id;index:idx_refresh_user"`
	TokenHash string         `gorm:"type:varchar(64);column:token_hash"`
	ExpiresAt time.Time      `gorm:"type:datetime(3);column:expires_at"`
	RevokedAt *time.Time     `gorm:"type:datetime(3);column:revoked_at"`
	CreatedAt time.Time      `gorm:"type:datetime(3);column:created_at"`
	UpdatedAt time.Time      `gorm:"type:datetime(3);column:updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"type:datetime(3);column:deleted_at;index"`
}

// TableName pins the table name.
func (RefreshTokenModel) TableName() string { return "refresh_tokens" }

// BeforeCreate generates a UUID + timestamps if missing.
func (m *RefreshTokenModel) BeforeCreate(*gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	m.UpdatedAt = m.CreatedAt
	return nil
}

// GormRefreshRepository implements auth.RefreshStore on GORM/MariaDB.
// The database is the source of truth so refresh tokens survive backend
// restarts (fixing auto-login-after-reload that broke with the in-memory store).
type GormRefreshRepository struct {
	db *gorm.DB
}

// NewGormRefreshRepository builds a DB-backed refresh-token store.
func NewGormRefreshRepository(db *gorm.DB) auth.RefreshStore {
	return &GormRefreshRepository{db: db}
}

func (r *GormRefreshRepository) Create(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error {
	m := &RefreshTokenModel{UserID: userID, TokenHash: tokenHash, ExpiresAt: expiresAt}
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormRefreshRepository) Revoke(ctx context.Context, tokenHash string) error {
	now := time.Now()
	if err := r.db.WithContext(ctx).Model(&RefreshTokenModel{}).
		Where("token_hash = ? AND revoked_at IS NULL", tokenHash).
		Update("revoked_at", now).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormRefreshRepository) RevokeAllForUser(ctx context.Context, userID string) error {
	now := time.Now()
	if err := r.db.WithContext(ctx).Model(&RefreshTokenModel{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormRefreshRepository) GetByHash(ctx context.Context, tokenHash string) (*auth.RefreshRecord, error) {
	var m RefreshTokenModel
	if err := r.db.WithContext(ctx).
		Where("token_hash = ?", tokenHash).
		First(&m).Error; err != nil {
		return nil, err // gorm.ErrRecordNotFound → usecase maps to token_invalid
	}
	return &auth.RefreshRecord{
		ID:        m.ID,
		UserID:    m.UserID,
		ExpiresAt: m.ExpiresAt,
		RevokedAt: m.RevokedAt,
	}, nil
}

// CleanExpired hard-deletes refresh tokens that are expired and no longer needed.
// It removes tokens where expires_at < before AND (revoked_at IS NOT NULL OR created_at < before).
// Returns the number of rows deleted.
func (r *GormRefreshRepository) CleanExpired(ctx context.Context, before time.Time) (int64, error) {
	result := r.db.WithContext(ctx).
		Where("expires_at < ? AND (revoked_at IS NOT NULL OR created_at < ?)", before, before).
		Delete(&RefreshTokenModel{})
	if result.Error != nil {
		return 0, apperrors.Internal("internal_error", result.Error)
	}
	return result.RowsAffected, nil
}

// StartCleanup spawns a background goroutine that periodically purges expired
// refresh tokens. Returns a stop function. Runs once immediately on start.
func (r *GormRefreshRepository) StartCleanup(ctx context.Context, interval, maxAge time.Duration) func() {
	done := make(chan struct{})
	// Run once immediately.
	r.cleanExpired(ctx, maxAge)
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				r.cleanExpired(ctx, maxAge)
			}
		}
	}()
	return func() { close(done) }
}

func (r *GormRefreshRepository) cleanExpired(ctx context.Context, maxAge time.Duration) {
	before := time.Now().Add(-maxAge)
	n, err := r.CleanExpired(ctx, before)
	if err != nil {
		log.Printf("refresh cleanup: %v", err)
		return
	}
	if n > 0 {
		log.Printf("refresh cleanup: deleted %d expired tokens older than %s", n, maxAge)
	}
}
