package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps a pgx connection pool
type DB struct {
	Pool *pgxpool.Pool
}

// Connect establishes a PostgreSQL connection pool for the given DSN
// and max connection count. It does not block waiting for the database to be reachable beyond pgx's own connect handling; callers should use Ping to verify readiness
func Connect(ctx context.Context, databaseURL string, maxConns int32) (*DB, error) {
	poolCfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("database: parse config: %w", err)
	}

	if maxConns > 0 {
		poolCfg.MaxConns = maxConns
	}
	poolCfg.MaxConnLifetime = time.Hour
	poolCfg.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("database: create pool: %w", err)
	}

	return &DB{Pool: pool}, nil
}

// Ping verifies the database is reachable within the given context
// (callers should attach a short timeout)
func (d *DB) Ping(ctx context.Context) error {
	if d == nil || d.Pool == nil {
		return fmt.Errorf("database: pool not initialized")
	}
	return d.Pool.Ping(ctx)
}

// Close releases all pooled connections
func (d *DB) Close() {
	if d != nil && d.Pool != nil {
		d.Pool.Close()
	}
}
