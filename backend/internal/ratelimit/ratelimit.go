// Package ratelimit provides a small Redis-backed fixed-window rate limiter,
// shared by every package that needs one (auth login attempts, registration
// creation, and chi middleware for path-based limits) instead of each
// hand-rolling the same INCR+EXPIRE logic.
package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Limiter implements a Redis fixed-window counter. Redis failures fail
// open — an outage must never lock every caller out entirely.
type Limiter struct {
	rdb *redis.Client
}

// NewLimiter builds a Limiter backed by rdb.
func NewLimiter(rdb *redis.Client) *Limiter {
	return &Limiter{rdb: rdb}
}

// Allow reports whether one more attempt at key is permitted within the
// current fixed window of the given size, incrementing key's count as a
// side effect. limit and window are passed per call so one Limiter instance
// can back several different policies distinguished by key prefix.
func (l *Limiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	count, err := l.rdb.Incr(ctx, key).Result()
	if err != nil {
		return true, fmt.Errorf("ratelimit: increment: %w", err)
	}
	if count == 1 {
		if err := l.rdb.Expire(ctx, key, window).Err(); err != nil {
			_ = l.rdb.Del(ctx, key).Err()
			return true, fmt.Errorf("ratelimit: set expiry: %w", err)
		}
	}
	return count <= int64(limit), nil
}

// Reset clears any current window for key, e.g. on a successful login.
func (l *Limiter) Reset(ctx context.Context, key string) error {
	if err := l.rdb.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("ratelimit: reset: %w", err)
	}
	return nil
}
