package registrations

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// ErrRateLimited is returned when a caller has exceeded the allowed
// number of attempts within the current window.
var ErrRateLimited = errors.New("registrations: rate limit exceeded, try again later")

// RateLimiter is a simple fixed-window Redis INCR+EXPIRE limiter. Not
// events/auth-specific — deliberately generic so other domains can
// reuse it later (only registration creation uses it this phase).
type RateLimiter struct {
	rdb    *redis.Client
	limit  int
	window time.Duration
}

// NewRateLimiter builds a RateLimiter allowing at most limit calls to
// Allow per window, per key.
func NewRateLimiter(rdb *redis.Client, limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{rdb: rdb, limit: limit, window: window}
}

// Allow increments the counter for key and reports whether the
// caller is still within the limit. On Redis error it fails open
// (allows the request) — rate limiting is a defense-in-depth
// abuse guard, not a correctness mechanism, so an outage here
// shouldn't block legitimate registrations.
func (l *RateLimiter) Allow(ctx context.Context, key string) (bool, error) {
	fullKey := fmt.Sprintf("reg:ratelimit:%s", key)

	count, err := l.rdb.Incr(ctx, fullKey).Result()
	if err != nil {
		return true, fmt.Errorf("registrations: rate limit incr: %w", err)
	}
	if count == 1 {
		l.rdb.Expire(ctx, fullKey, l.window)
	}
	return count <= int64(l.limit), nil
}
