//go:build integration

package registrations

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func TestLockReleasePreservesNewOwner(t *testing.T) {
	addr := os.Getenv("REDIS_TEST_ADDR")
	if addr == "" {
		t.Skip("REDIS_TEST_ADDR is required")
	}
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	t.Cleanup(func() { _ = rdb.Close() })
	ctx := context.Background()
	locker := NewLocker(rdb, time.Minute)
	id := uuid.New()
	old, err := locker.TryLock(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { rdb.Del(ctx, lockKey(id)) })
	if _, err = locker.TryLock(ctx, id); err != ErrLockNotAcquired {
		t.Fatalf("second owner acquired a held lock: %v", err)
	}
	// Simulate expiry and acquisition by a new instance before stale release.
	if err = rdb.Del(ctx, lockKey(id)).Err(); err != nil {
		t.Fatal(err)
	}
	newOwner, err := locker.TryLock(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	old.Release(ctx)
	if got := rdb.Get(ctx, lockKey(id)).Val(); got != newOwner.token {
		t.Fatal("stale owner removed the replacement lock")
	}
	newOwner.Release(ctx)
	if rdb.Exists(ctx, lockKey(id)).Val() != 0 {
		t.Fatal("owner did not release its lock")
	}
}
