package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// KioskToken is the persisted kiosk access token record.
type KioskToken struct {
	ID         string     `gorm:"column:id;type:varchar(36);primaryKey" json:"-"`
	Token      string     `gorm:"column:token;type:varchar(64);uniqueIndex" json:"-"`
	SessionID  string     `gorm:"column:session_id;type:varchar(36);index" json:"-"`
	TenantID   string     `gorm:"column:tenant_id;type:varchar(36)" json:"-"`
	ExpiresAt  time.Time  `gorm:"column:expires_at" json:"-"`
	ConsumedAt *time.Time `gorm:"column:consumed_at;type:datetime(3)" json:"-"`
	CreatedAt  time.Time  `gorm:"column:created_at" json:"-"`
}

// TableName pins the table name.
func (KioskToken) TableName() string { return "kiosk_tokens" }

// KioskRecord is the validated, in-memory view of a kiosk token.
type KioskRecord struct {
	Token     string
	SessionID string
	TenantID  string
	ExpiresAt time.Time
}

// KioskTokenStore issues, validates, and consumes single-use kiosk tokens.
type KioskTokenStore interface {
	Issue(ctx context.Context, sessionID, tenantID string, ttl time.Duration) (token string, err error)
	Validate(ctx context.Context, token string) (sessionID, tenantID string, err error)
	Consume(ctx context.Context, token string) error
}

// DBKioskStore persists kiosk tokens in MariaDB and keeps an in-memory
// read-through cache keyed by token so hot-path validation avoids a DB hit.
// Cache entries are invalidated on Issue/Consume. Multi-replica deployments
// should add a shared cache/lock; single-instance is correct as-is.
type DBKioskStore struct {
	db    *gorm.DB
	mu    sync.RWMutex
	cache map[string]*KioskRecord
	// nowFn allows tests to control time; defaults to time.Now.
	nowFn func() time.Time
}

// NewKioskStore builds a DB-backed kiosk store with an in-memory cache.
func NewKioskStore(db *gorm.DB) *DBKioskStore {
	return &DBKioskStore{db: db, cache: make(map[string]*KioskRecord), nowFn: time.Now}
}

// Issue creates a new kiosk token bound to a session+tenant, cached for fast lookup.
func (s *DBKioskStore) Issue(ctx context.Context, sessionID, tenantID string, ttl time.Duration) (string, error) {
	if sessionID == "" || tenantID == "" {
		return "", apperrors.BadRequest("validation_error", nil)
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", apperrors.Internal("internal_error", err)
	}
	token := hex.EncodeToString(buf)
	now := s.nowFn()
	rec := &KioskToken{
		ID:        newKioskUUID(),
		Token:     token,
		SessionID: sessionID,
		TenantID:  tenantID,
		ExpiresAt: now.Add(ttl),
		CreatedAt: now,
	}
	if err := s.db.WithContext(ctx).Create(rec).Error; err != nil {
		return "", apperrors.Internal("internal_error", err)
	}
	s.mu.Lock()
	s.cache[token] = &KioskRecord{
		Token:     token,
		SessionID: sessionID,
		TenantID:  tenantID,
		ExpiresAt: rec.ExpiresAt,
	}
	s.mu.Unlock()
	return token, nil
}

// Validate returns the session/tenant binding for a live (unconsumed, unexpired) token.
func (s *DBKioskStore) Validate(ctx context.Context, token string) (string, string, error) {
	// Read-through cache first.
	s.mu.RLock()
	cached, ok := s.cache[token]
	s.mu.RUnlock()
	if ok {
		if s.nowFn().After(cached.ExpiresAt) {
			s.invalidate(token)
			return "", "", apperrors.NotFound("kiosk_token_expired", nil)
		}
		return cached.SessionID, cached.TenantID, nil
	}

	var rec KioskToken
	if err := s.db.WithContext(ctx).Where("token = ?", token).First(&rec).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return "", "", apperrors.NotFound("kiosk_token_invalid", nil)
		}
		return "", "", apperrors.Internal("internal_error", err)
	}
	if rec.ConsumedAt != nil {
		return "", "", apperrors.NotFound("kiosk_token_consumed", nil)
	}
	if s.nowFn().After(rec.ExpiresAt) {
		return "", "", apperrors.NotFound("kiosk_token_expired", nil)
	}
	// Populate cache for subsequent fast validation.
	s.mu.Lock()
	s.cache[token] = &KioskRecord{
		Token:     rec.Token,
		SessionID: rec.SessionID,
		TenantID:  rec.TenantID,
		ExpiresAt: rec.ExpiresAt,
	}
	s.mu.Unlock()
	return rec.SessionID, rec.TenantID, nil
}

// Consume marks a token as used (single-use kiosk access).
func (s *DBKioskStore) Consume(ctx context.Context, token string) error {
	now := s.nowFn()
	if err := s.db.WithContext(ctx).
		Model(&KioskToken{}).
		Where("token = ? AND consumed_at IS NULL", token).
		Update("consumed_at", &now).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	s.invalidate(token)
	return nil
}

// invalidate drops a token from the in-memory cache.
func (s *DBKioskStore) invalidate(token string) {
	s.mu.Lock()
	delete(s.cache, token)
	s.mu.Unlock()
}

// newKioskUUID generates a CHAR(36) primary key.
func newKioskUUID() string {
	return uuid.NewString()
}
