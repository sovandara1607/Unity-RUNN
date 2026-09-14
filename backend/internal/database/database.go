package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps a pgx connection pool
type DB struct {
	Pool *pgxpool.Pool
}

// Options configures the pool built by Connect. Zero values fall back to
// sensible defaults (see Connect).
type Options struct {
	MaxConns        int32
	MinConns        int32
	MaxConnLifetime time.Duration
	MaxConnIdleTime time.Duration
	// PgBouncerCompat disables pgx's server-side NAMED prepared statement
	// cache. Required when DatabaseURL points at PgBouncer in "transaction"
	// pool mode: the backend Postgres connection behind a client's socket to
	// PgBouncer can change between transactions, so a statement prepared
	// during one transaction can go missing ("prepared statement does not
	// exist") on the next.
	//
	// This uses pgx.QueryExecModeCacheDescribe. Two other modes were tried
	// and rejected against this codebase's real queries before landing here:
	//   - QueryExecModeSimpleProtocol inlines parameters as untyped SQL text,
	//     leaving PostgreSQL's parser to infer each one's type purely from
	//     surrounding syntax. That breaks ClaimPendingPayments' timestamp
	//     arithmetic (`$1 + ($4 * interval '1 second')` →  "invalid input
	//     syntax for type interval") and any []byte parameter bound to a
	//     jsonb column (idempotency_keys.response_body → "invalid input
	//     syntax for type json").
	//   - QueryExecModeExec skips the Describe round trip and picks each
	//     parameter's PostgreSQL type solely from its Go type (e.g. []byte →
	//     bytea) with no server input, hitting the exact same jsonb failure.
	// QueryExecModeCacheDescribe still asks PostgreSQL to Describe each query
	// (so parameter types are resolved correctly, same as the default mode)
	// and caches that description client-side keyed by SQL text — but never
	// creates a server-side NAMED statement tied to one physical connection,
	// which is what actually breaks under PgBouncer transaction pooling.
	PgBouncerCompat bool
}

// Connect establishes a PostgreSQL connection pool for the given DSN.
// It does not block waiting for the database to be reachable beyond pgx's own connect handling; callers should use Ping to verify readiness
func Connect(ctx context.Context, databaseURL string, opts Options) (*DB, error) {
	poolCfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("database: parse config: %w", err)
	}

	if opts.MaxConns > 0 {
		poolCfg.MaxConns = opts.MaxConns
	}
	if opts.MinConns > 0 {
		poolCfg.MinConns = opts.MinConns
	}
	poolCfg.MaxConnLifetime = opts.MaxConnLifetime
	if poolCfg.MaxConnLifetime <= 0 {
		poolCfg.MaxConnLifetime = time.Hour
	}
	poolCfg.MaxConnIdleTime = opts.MaxConnIdleTime
	if poolCfg.MaxConnIdleTime <= 0 {
		poolCfg.MaxConnIdleTime = 30 * time.Minute
	}
	if opts.PgBouncerCompat {
		poolCfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeCacheDescribe
	}

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
