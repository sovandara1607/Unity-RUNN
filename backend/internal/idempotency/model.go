// Package idempotency lets a POST handler replay the stored outcome of an
// earlier request instead of re-executing it, keyed by a client-supplied
// Idempotency-Key header. It is intentionally generic (the route is part of
// the key) so it can be reused by other endpoints beyond registration
// creation.
package idempotency

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// ErrNotFound is returned when no stored outcome exists for a (user, route, key).
var ErrNotFound = errors.New("idempotency: no stored outcome")

// ErrConflict is returned when a key is reused with a request body that
// hashes differently from the one it was first stored with.
var ErrConflict = errors.New("idempotency: key reused with a different request payload")

// Record is a stored request outcome, replayed verbatim on retry.
type Record struct {
	UserID         uuid.UUID
	Key            string
	Route          string
	RequestHash    string
	ResponseStatus int
	// ResponseBody is the raw JSON of the response payload (not wrapped in
	// the {"data": ...} envelope; callers re-wrap it if needed).
	ResponseBody []byte
	CreatedAt    time.Time
	ExpiresAt    time.Time
}
