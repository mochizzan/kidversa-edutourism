package auth

import (
	"context"
	"sync"
	"time"
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
