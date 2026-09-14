package registrations

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/unity-run-club/api/internal/ratelimit"
)

var ErrRateLimited = errors.New("registrations: rate limit exceeded, try again later")

type RateLimiter struct {
	limiter *ratelimit.Limiter
	limit   int
	window  time.Duration
}

func NewRateLimiter(rdb *redis.Client, limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{limiter: ratelimit.NewLimiter(rdb), limit: limit, window: window}
}

func (l *RateLimiter) Allow(ctx context.Context, key string) (bool, error) {
	return l.limiter.Allow(ctx, fmt.Sprintf("reg:ratelimit:%s", key), l.limit, l.window)
}
