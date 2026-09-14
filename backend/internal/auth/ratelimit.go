package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/unity-run-club/api/internal/ratelimit"
)

// AttemptLimiter throttles repeated authentication attempts for one
// normalized account identity. Implementations must not store raw emails.
type AttemptLimiter interface {
	Allow(ctx context.Context, identity string) (bool, error)
	Reset(ctx context.Context, identity string) error
}

type RedisAttemptLimiter struct {
	limiter *ratelimit.Limiter
	limit   int
	window  time.Duration
}

func NewRedisAttemptLimiter(rdb *redis.Client, limit int, window time.Duration) *RedisAttemptLimiter {
	return &RedisAttemptLimiter{limiter: ratelimit.NewLimiter(rdb), limit: limit, window: window}
}

func (l *RedisAttemptLimiter) key(identity string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(identity))))
	return "auth:login:" + hex.EncodeToString(sum[:])
}

// Allow uses a Redis fixed window. Redis failures fail open so an outage does
// not lock every runner out of their account.
func (l *RedisAttemptLimiter) Allow(ctx context.Context, identity string) (bool, error) {
	return l.limiter.Allow(ctx, l.key(identity), l.limit, l.window)
}

func (l *RedisAttemptLimiter) Reset(ctx context.Context, identity string) error {
	return l.limiter.Reset(ctx, l.key(identity))
}
