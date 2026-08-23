package registrations

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// ErrLockNotAcquired is returned when a category's registration lock
// is already held by another in-flight request.
var ErrLockNotAcquired = errors.New("registrations: category is busy, try again")

// Locker acquires short-lived per-category registration locks in
// Redis, so a thundering herd fails fast (429) instead of piling up
// as Postgres contention. This is purely a performance optimization:
// if Redis is unreachable, TryLock returns an error and the caller
// should fail open (proceed to Postgres, which remains the
// authoritative capacity check via row locking).
type Locker struct {
	rdb *redis.Client
	ttl time.Duration
}

// NewLocker builds a Locker with the given lock TTL (how long a lock
// is held before it auto-expires, bounding the damage from a crashed
// holder).
func NewLocker(rdb *redis.Client, ttl time.Duration) *Locker {
	return &Locker{rdb: rdb, ttl: ttl}
}

// Lock is a held registration lock; call Release when done (typically
// via defer).
type Lock struct {
	locker *Locker
	key    string
	token  string
}

// TryLock attempts to acquire the lock for categoryID, returning
// ErrLockNotAcquired if another request currently holds it.
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

// Release deletes the lock, but only if it still holds our token —
// avoids releasing a lock some other holder acquired after ours
// expired.
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
