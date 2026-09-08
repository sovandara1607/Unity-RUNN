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

var releaseLock = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`)

func (l *Lock) Release(ctx context.Context) {
	// Compare and delete atomically: an expired owner must never delete a
	// replacement lock acquired by another API instance. TTL handles failures.
	_ = releaseLock.Run(ctx, l.locker.rdb, []string{l.key}, l.token).Err()
}

func lockKey(categoryID uuid.UUID) string {
	return fmt.Sprintf("reg:lock:category:%s", categoryID)
}
