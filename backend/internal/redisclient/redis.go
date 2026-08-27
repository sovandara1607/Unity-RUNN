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

func Connect(addr, password string, db int) *Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})
	return &Client{rdb: rdb}
}

func (c *Client) Raw() *redis.Client {
	return c.rdb
}

func (c *Client) Ping(ctx context.Context) error {
	if c == nil || c.rdb == nil {
		return fmt.Errorf("redisclient: client not initialized")
	}
	return c.rdb.Ping(ctx).Err()
}

func (c *Client) Close() error {
	if c == nil || c.rdb == nil {
		return nil
	}
	return c.rdb.Close()
}
