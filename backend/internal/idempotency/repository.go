package idempotency

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// dbtx is satisfied by both *pgxpool.Pool and pgx.Tx, so Store can either run
// standalone or inside a caller's already-open transaction (e.g. the same
// transaction that inserted the resource the response describes).
type dbtx interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Repository persists idempotency records in PostgreSQL.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository builds a Repository backed by pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Find looks up a stored outcome for (userID, route, key).
func (r *Repository) Find(ctx context.Context, userID uuid.UUID, route, key string) (*Record, error) {
	const query = `
		SELECT user_id, key, route, request_hash, response_status, response_body, created_at, expires_at
		FROM idempotency_keys WHERE user_id = $1 AND key = $2 AND route = $3`

	var rec Record
	err := r.pool.QueryRow(ctx, query, userID, key, route).Scan(
		&rec.UserID, &rec.Key, &rec.Route, &rec.RequestHash, &rec.ResponseStatus,
		&rec.ResponseBody, &rec.CreatedAt, &rec.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("idempotency: find: %w", err)
	}
	return &rec, nil
}

// Store persists rec via q, which may be the pool itself or a caller's open
// transaction. A repeat Store for the same key is a harmless no-op — the
// first write wins.
func (r *Repository) Store(ctx context.Context, q dbtx, rec Record) error {
	const query = `
		INSERT INTO idempotency_keys (user_id, key, route, request_hash, response_status, response_body)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id, key, route) DO NOTHING`
	_, err := q.Exec(ctx, query, rec.UserID, rec.Key, rec.Route, rec.RequestHash, rec.ResponseStatus, rec.ResponseBody)
	if err != nil {
		return fmt.Errorf("idempotency: store: %w", err)
	}
	return nil
}

// DeleteExpired removes stored outcomes past their expiry, returning how many rows were removed.
func (r *Repository) DeleteExpired(ctx context.Context, now time.Time) (int64, error) {
	tag, err := r.pool.Exec(ctx, `DELETE FROM idempotency_keys WHERE expires_at <= $1`, now)
	if err != nil {
		return 0, fmt.Errorf("idempotency: delete expired: %w", err)
	}
	return tag.RowsAffected(), nil
}
