package database

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// TestConnect_OptionsDefaults exercises Connect's option handling without a
// real database: pgxpool.ParseConfig succeeds on any well-formed DSN, and
// NewWithConfig doesn't dial until a connection is actually acquired, so we
// can inspect the resulting pool config directly.
func TestConnect_OptionsDefaults(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	db, err := Connect(ctx, "postgres://user:pass@localhost:5/db", Options{})
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	defer db.Close()

	cfg := db.Pool.Config()
	if cfg.MaxConnLifetime != time.Hour {
		t.Errorf("MaxConnLifetime = %v, want 1h default", cfg.MaxConnLifetime)
	}
	if cfg.MaxConnIdleTime != 30*time.Minute {
		t.Errorf("MaxConnIdleTime = %v, want 30m default", cfg.MaxConnIdleTime)
	}
	if cfg.ConnConfig.DefaultQueryExecMode == pgx.QueryExecModeCacheDescribe {
		t.Errorf("DefaultQueryExecMode = CacheDescribe, want the pgx default when PgBouncerCompat is false")
	}
}

func TestConnect_OptionsOverridesAndPgBouncerCompat(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	db, err := Connect(ctx, "postgres://user:pass@localhost:5/db", Options{
		MaxConns: 33, MinConns: 3,
		MaxConnLifetime: 2 * time.Hour, MaxConnIdleTime: 5 * time.Minute,
		PgBouncerCompat: true,
	})
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	defer db.Close()

	cfg := db.Pool.Config()
	if cfg.MaxConns != 33 {
		t.Errorf("MaxConns = %d, want 33", cfg.MaxConns)
	}
	if cfg.MinConns != 3 {
		t.Errorf("MinConns = %d, want 3", cfg.MinConns)
	}
	if cfg.MaxConnLifetime != 2*time.Hour {
		t.Errorf("MaxConnLifetime = %v, want 2h", cfg.MaxConnLifetime)
	}
	if cfg.MaxConnIdleTime != 5*time.Minute {
		t.Errorf("MaxConnIdleTime = %v, want 5m", cfg.MaxConnIdleTime)
	}
	if cfg.ConnConfig.DefaultQueryExecMode != pgx.QueryExecModeCacheDescribe {
		t.Errorf("DefaultQueryExecMode = %v, want QueryExecModeCacheDescribe when PgBouncerCompat is true", cfg.ConnConfig.DefaultQueryExecMode)
	}
}
