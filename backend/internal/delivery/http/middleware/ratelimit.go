package middleware

import (
	"sync"
	"time"

	"github.com/labstack/echo/v5"
)

// securityHeaders applies baseline hardening headers to every response.
func SecurityHeaders() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			h := c.Response().Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "no-referrer")
			h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			return next(c)
		}
	}
}

// tokenBucket is a simple in-memory per-IP token bucket.
type tokenBucket struct {
	tokens    int
	lastRefill time.Time
}

// RateLimit returns middleware limiting each client IP to perMin requests per minute.
func RateLimit(perMin int) echo.MiddlewareFunc {
	var mu sync.Mutex
	buckets := make(map[string]*tokenBucket)
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			ip := c.RealIP()
			now := time.Now()
			mu.Lock()
			b, ok := buckets[ip]
			if !ok {
				b = &tokenBucket{tokens: perMin, lastRefill: now}
				buckets[ip] = b
			}
			mu.Unlock()

			elapsed := now.Sub(b.lastRefill).Minutes()
			if elapsed > 0 {
				b.tokens += int(elapsed * float64(perMin))
				if b.tokens > perMin {
					b.tokens = perMin
				}
				b.lastRefill = now
			}
			if b.tokens <= 0 {
				c.Response().Header().Set("Retry-After", "60")
				return echo.NewHTTPError(429, "too_many_requests")
			}
			b.tokens--
			return next(c)
		}
	}
}
