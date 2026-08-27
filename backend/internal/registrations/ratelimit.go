package registrations

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var ErrRateLimited = errors.New("registrations: rate limit exceeded, try again later")

type RateLimiter struct {
	rdb    *redis.Client
	limit  int
	window time.Duration
}

func NewRateLimiter(rdb *redis.Client, limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{rdb: rdb, limit: limit, window: window}
}

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
