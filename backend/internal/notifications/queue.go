package notifications

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	queueKey     = "notifications:queue"
	heartbeatKey = "notifications:worker:heartbeat"
)

// Queue is a thin Redis list wrapper
type Queue struct {
	rdb *redis.Client
}

// NewQueue builds a queue backed by rdb.
func NewQueue(rdb *redis.Client) *Queue {
	return &Queue{rdb: rdb}
}

func (q *Queue) push(ctx context.Context, notificationID string) error {
	if err := q.rdb.LPush(ctx, queueKey, notificationID).Err(); err != nil {
		return fmt.Errorf("notifications: queue push: %w", err)
	}
	return nil
}

// pop blocks up to timeout for the next notification ID
func (q *Queue) pop(ctx context.Context, timeout time.Duration) (string, error) {
	result, err := q.rdb.BRPop(ctx, timeout, queueKey).Result()
	if err == redis.Nil {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("notifications: queue pop: %w", err)
	}
	// BRPop returns [key, value].
	if len(result) < 2 {
		return "", nil
	}
	return result[1], nil
}

func (q *Queue) heartbeat(ctx context.Context, ttl time.Duration) error {
	seenAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := q.rdb.Set(ctx, heartbeatKey, seenAt, ttl).Err(); err != nil {
		return fmt.Errorf("notifications: worker heartbeat: %w", err)
	}
	return nil
}
