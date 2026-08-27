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

// Queue is a thin Redis list wrapper: push enqueues a notification
// ID, pop blocks (with timeout) for the next one. push/pop are
// unexported — only Service/Worker in this package call them.
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

// pop blocks up to timeout for the next notification ID. Returns
// ("", nil) on timeout (nothing to do — not an error).
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
