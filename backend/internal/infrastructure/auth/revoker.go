package auth

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// InMemoryRevoker is a single-instance jti denylist (v1). Swap for Redis in multi-replica.
type InMemoryRevoker struct {
	mu     sync.RWMutex
	denied map[string]time.Time // jti -> expiry
	stop   chan struct{}
}

// NewInMemoryRevoker starts a background purge goroutine.
func NewInMemoryRevoker() *InMemoryRevoker {
	r := &InMemoryRevoker{denied: make(map[string]time.Time), stop: make(chan struct{})}
	go r.purge()
	return r
}

// Revoke adds a jti to the denylist until it expires.
func (r *InMemoryRevoker) Revoke(_ context.Context, jti string, ttl time.Duration) {
	r.mu.Lock()
	r.denied[jti] = time.Now().Add(ttl)
	r.mu.Unlock()
}

// IsRevoked reports whether a jti is currently denied.
func (r *InMemoryRevoker) IsRevoked(_ context.Context, jti string) bool {
	r.mu.RLock()
	exp, ok := r.denied[jti]
	r.mu.RUnlock()
	return ok && time.Now().Before(exp)
}

func (r *InMemoryRevoker) purge() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-r.stop:
			return
		case <-ticker.C:
			now := time.Now()
			r.mu.Lock()
			for jti, exp := range r.denied {
				if now.After(exp) {
					delete(r.denied, jti)
				}
			}
			r.mu.Unlock()
		}
	}
}

// Stop terminates the purge goroutine.
func (r *InMemoryRevoker) Stop() { close(r.stop) }

// InMemoryRefreshStore is a single-instance opaque refresh-token store (v1).
// For v1 correctness it is backed by the refresh_tokens table via GORM; this type
// is the in-process cache-free path. (Persistence to MariaDB is the source of truth;
// see persistence.GormRefreshRepository for the DB-backed implementation.)
type InMemoryRefreshStore struct {
	mu    sync.RWMutex
	store map[string]*RefreshRecord // keyed by token hash
}

// NewInMemoryRefreshStore builds an empty store.
func NewInMemoryRefreshStore() *InMemoryRefreshStore {
	return &InMemoryRefreshStore{store: make(map[string]*RefreshRecord)}
}

func (s *InMemoryRefreshStore) Create(_ context.Context, userID, tokenHash string, expiresAt time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.store[tokenHash] = &RefreshRecord{ID: uuid.NewString(), UserID: userID, ExpiresAt: expiresAt}
	return nil
}

func (s *InMemoryRefreshStore) Revoke(_ context.Context, tokenHash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.store[tokenHash]; ok {
		now := time.Now()
		r.RevokedAt = &now
	}
	return nil
}

func (s *InMemoryRefreshStore) RevokeAllForUser(_ context.Context, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for _, r := range s.store {
		if r.UserID == userID {
			r.RevokedAt = &now
		}
	}
	return nil
}

func (s *InMemoryRefreshStore) GetByHash(_ context.Context, tokenHash string) (*RefreshRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.store[tokenHash]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return r, nil
}

func (s *InMemoryRefreshStore) CleanExpired(_ context.Context, before time.Time) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var count int64
	for hash, r := range s.store {
		if r.ExpiresAt.Before(before) {
			delete(s.store, hash)
			count++
		}
	}
	return count, nil
}

// StartCleanup is a no-op for the in-memory store (no persistence to purge).
// It returns a stop function for API parity with the DB-backed implementation.
func (s *InMemoryRefreshStore) StartCleanup(_ context.Context, _ time.Duration, _ time.Duration) func() {
	done := make(chan struct{})
	go func() {
		<-done
	}()
	return func() { close(done) }
}
