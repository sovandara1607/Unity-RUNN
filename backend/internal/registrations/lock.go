package registrations

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

var ErrLockNotAcquired = errors.New("registrations: category is busy, try again")

type Locker struct {
	rdb *redis.Client
	ttl time.Duration
}

func NewLocker(rdb *redis.Client, ttl time.Duration) *Locker {
	return &Locker{rdb: rdb, ttl: ttl}
}

// Lock is a held registration lock; call Release when done (typically via defer).
type Lock struct {
	locker *Locker
	key    string
	token  string
}

func (l *Locker) TryLock(ctx context.Context, categoryID uuid.UUID) (*Lock, error) {
	key := lockKey(categoryID)
	token := uuid.NewString()

	ok, err := l.rdb.SetNX(ctx, key, token, l.ttl).Result()
	if err != nil {
		return nil, fmt.Errorf("registrations: acquire lock: %w", err)
	}
	if !ok {
		return nil, ErrLockNotAcquired
	}
	return &Lock{locker: l, key: key, token: token}, nil
}

func (l *Lock) Release(ctx context.Context) {
	// Best-effort: if this fails, the lock still expires via its TTL.
	current, err := l.locker.rdb.Get(ctx, l.key).Result()
	if err == nil && current == l.token {
		l.locker.rdb.Del(ctx, l.key)
	}
}

func lockKey(categoryID uuid.UUID) string {
	return fmt.Sprintf("reg:lock:category:%s", categoryID)
}
