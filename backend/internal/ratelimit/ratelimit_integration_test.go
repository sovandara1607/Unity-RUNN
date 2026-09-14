//go:build integration

package ratelimit

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func testLimiter(t *testing.T) *Limiter {
	t.Helper()
	addr := os.Getenv("REDIS_TEST_ADDR")
	if addr == "" {
		t.Skip("REDIS_TEST_ADDR is required")
	}
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	t.Cleanup(func() { _ = rdb.Close() })
	return NewLimiter(rdb)
}

func TestLimiter_AllowsUpToLimitThenRejects(t *testing.T) {
	l := testLimiter(t)
	ctx := context.Background()
	key := "test:" + uuid.NewString()
	t.Cleanup(func() { _ = l.Reset(ctx, key) })

	for i := 0; i < 3; i++ {
		allowed, err := l.Allow(ctx, key, 3, time.Minute)
		if err != nil {
			t.Fatalf("Allow() error = %v", err)
		}
		if !allowed {
			t.Fatalf("Allow() attempt %d = false, want true", i+1)
		}
	}

	allowed, err := l.Allow(ctx, key, 3, time.Minute)
	if err != nil {
		t.Fatalf("Allow() error = %v", err)
	}
	if allowed {
		t.Fatal("Allow() on the 4th attempt = true, want false")
	}
}

func TestLimiter_ResetClearsTheWindow(t *testing.T) {
	l := testLimiter(t)
	ctx := context.Background()
	key := "test:" + uuid.NewString()
	t.Cleanup(func() { _ = l.Reset(ctx, key) })

	if _, err := l.Allow(ctx, key, 1, time.Minute); err != nil {
		t.Fatalf("Allow() error = %v", err)
	}
	if allowed, _ := l.Allow(ctx, key, 1, time.Minute); allowed {
		t.Fatal("Allow() expected to be rate limited before Reset")
	}

	if err := l.Reset(ctx, key); err != nil {
		t.Fatalf("Reset() error = %v", err)
	}

	allowed, err := l.Allow(ctx, key, 1, time.Minute)
	if err != nil {
		t.Fatalf("Allow() after Reset error = %v", err)
	}
	if !allowed {
		t.Fatal("Allow() after Reset = false, want true")
	}
}

func TestLimiter_IndependentKeysDoNotShareBudget(t *testing.T) {
	l := testLimiter(t)
	ctx := context.Background()
	keyA := "test:" + uuid.NewString()
	keyB := "test:" + uuid.NewString()
	t.Cleanup(func() { _ = l.Reset(ctx, keyA); _ = l.Reset(ctx, keyB) })

	if _, err := l.Allow(ctx, keyA, 1, time.Minute); err != nil {
		t.Fatalf("Allow(keyA) error = %v", err)
	}
	allowed, err := l.Allow(ctx, keyB, 1, time.Minute)
	if err != nil {
		t.Fatalf("Allow(keyB) error = %v", err)
	}
	if !allowed {
		t.Fatal("Allow(keyB) = false, want true (independent key budget)")
	}
}
