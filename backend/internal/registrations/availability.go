package registrations

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type AvailabilityCache struct {
	rdb *redis.Client
	ttl time.Duration
}

// NewAvailabilityCache builds an AvailabilityCache with the given TTL.
func NewAvailabilityCache(rdb *redis.Client, ttl time.Duration) *AvailabilityCache {
	return &AvailabilityCache{rdb: rdb, ttl: ttl}
}

// Get returns a cached Availability, or (nil, nil) on a cache miss.
func (c *AvailabilityCache) Get(ctx context.Context, categoryID uuid.UUID) (*Availability, error) {
	raw, err := c.rdb.Get(ctx, availabilityKey(categoryID)).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("registrations: get availability cache: %w", err)
	}

	var a Availability
	if err := json.Unmarshal([]byte(raw), &a); err != nil {
		return nil, fmt.Errorf("registrations: decode availability cache: %w", err)
	}
	return &a, nil
}

// Set stores an Availability snapshot with the cache's TTL.
func (c *AvailabilityCache) Set(ctx context.Context, categoryID uuid.UUID, a Availability) error {
	raw, err := json.Marshal(a)
	if err != nil {
		return fmt.Errorf("registrations: encode availability cache: %w", err)
	}
	return c.rdb.Set(ctx, availabilityKey(categoryID), raw, c.ttl).Err()
}

func (c *AvailabilityCache) Invalidate(ctx context.Context, categoryID uuid.UUID) error {
	return c.rdb.Del(ctx, availabilityKey(categoryID)).Err()
}

func availabilityKey(categoryID uuid.UUID) string {
	return fmt.Sprintf("reg:availability:category:%s", categoryID)
}
