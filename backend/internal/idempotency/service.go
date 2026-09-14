package idempotency

import (
	"context"
	"crypto/sha256"
	"encoding/hex"

	"github.com/google/uuid"
)

// Service wraps Repository with the lookup/conflict semantics callers need.
type Service struct {
	repo *Repository
}

// NewService builds a Service backed by repo.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// HashRequest returns a stable digest of a raw request body, used to detect
// a key reused with a different payload.
func HashRequest(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// Lookup reports the stored outcome for (userID, route, key), if any.
//
//   - No record: (nil, ErrNotFound) — caller should proceed normally.
//   - Record with a matching request hash: (rec, nil) — caller should replay it.
//   - Record with a different request hash: (nil, ErrConflict) — the same key
//     was reused for a different request.
func (s *Service) Lookup(ctx context.Context, userID uuid.UUID, route, key, requestHash string) (*Record, error) {
	rec, err := s.repo.Find(ctx, userID, route, key)
	if err != nil {
		return nil, err
	}
	if rec.RequestHash != requestHash {
		return nil, ErrConflict
	}
	return rec, nil
}

// StoreOutcome persists a successful outcome for later replay. q may be the
// pool or a caller's open transaction.
func (s *Service) StoreOutcome(ctx context.Context, q dbtx, userID uuid.UUID, route, key, requestHash string, status int, body []byte) error {
	return s.repo.Store(ctx, q, Record{
		UserID:         userID,
		Key:            key,
		Route:          route,
		RequestHash:    requestHash,
		ResponseStatus: status,
		ResponseBody:   body,
	})
}
