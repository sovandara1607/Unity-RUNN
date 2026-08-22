// Package redisclient manages the Redis client used for rate limiting,
// caching, and short-lived locks elsewhere in the application. Redis
// is never the source of truth — PostgreSQL is — so this package only
// deals with connection lifecycle and health checks.
package redisclient

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// Client wraps a Redis client.
type Client struct {
	rdb *redis.Client
}

// Connect builds a Redis client for the given address/password/db.
// It does not block on connectivity; use Ping to verify readiness.
func Connect(addr, password string, db int) *Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})
	return &Client{rdb: rdb}
}

// Raw exposes the underlying *redis.Client for future domain packages
// (rate limiting, locks, caching) to build on.
func (c *Client) Raw() *redis.Client {
	return c.rdb
}

// Ping verifies Redis is reachable within the given context (callers
// should attach a short timeout).
func (c *Client) Ping(ctx context.Context) error {
	if c == nil || c.rdb == nil {
		return fmt.Errorf("redisclient: client not initialized")
	}
	return c.rdb.Ping(ctx).Err()
}

// Close closes the underlying connection(s).
func (c *Client) Close() error {
	if c == nil || c.rdb == nil {
		return nil
	}
	return c.rdb.Close()
}
