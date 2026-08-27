package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// AttemptLimiter throttles repeated authentication attempts for one
// normalized account identity. Implementations must not store raw emails.
type AttemptLimiter interface {
	Allow(ctx context.Context, identity string) (bool, error)
	Reset(ctx context.Context, identity string) error
}

type RedisAttemptLimiter struct {
	rdb    *redis.Client
	limit  int64
	window time.Duration
}

func NewRedisAttemptLimiter(rdb *redis.Client, limit int, window time.Duration) *RedisAttemptLimiter {
	return &RedisAttemptLimiter{rdb: rdb, limit: int64(limit), window: window}
}

func (l *RedisAttemptLimiter) key(identity string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(identity))))
	return "auth:login:" + hex.EncodeToString(sum[:])
}

// Allow uses a Redis fixed window. Redis failures fail open so an outage does
// not lock every runner out of their account.
func (l *RedisAttemptLimiter) Allow(ctx context.Context, identity string) (bool, error) {
	key := l.key(identity)
	count, err := l.rdb.Incr(ctx, key).Result()
	if err != nil {
		return true, fmt.Errorf("auth: rate limit increment: %w", err)
	}
	if count == 1 {
		if err := l.rdb.Expire(ctx, key, l.window).Err(); err != nil {
			_ = l.rdb.Del(ctx, key).Err()
			return true, fmt.Errorf("auth: rate limit expiry: %w", err)
		}
	}
	return count <= l.limit, nil
}

func (l *RedisAttemptLimiter) Reset(ctx context.Context, identity string) error {
	if err := l.rdb.Del(ctx, l.key(identity)).Err(); err != nil {
		return fmt.Errorf("auth: reset rate limit: %w", err)
	}
	return nil
}
