package idempotency

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// jsonEqual compares two JSON byte strings by decoded value, not by raw
// bytes — PostgreSQL's JSONB column type reformats whitespace on storage
// (e.g. inserting a space after every ":"), so a round-tripped body is
// JSON-equivalent to, but not byte-identical to, what was stored.
func jsonEqual(t *testing.T, a, b []byte) bool {
	t.Helper()
	var va, vb any
	if err := json.Unmarshal(a, &va); err != nil {
		t.Fatalf("unmarshal a: %v", err)
	}
	if err := json.Unmarshal(b, &vb); err != nil {
		t.Fatalf("unmarshal b: %v", err)
	}
	return reflect.DeepEqual(va, vb)
}

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE idempotency_keys CASCADE`); err != nil {
		t.Fatalf("truncate idempotency_keys: %v", err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE TABLE users CASCADE`); err != nil {
		t.Fatalf("truncate users: %v", err)
	}

	return pool
}

func seedUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var userID uuid.UUID
	err := pool.QueryRow(context.Background(), `
		INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'USER') RETURNING id`,
		uuid.NewString()+"@test.local").Scan(&userID)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return userID
}

func TestService_Lookup_NotFound(t *testing.T) {
	pool := testPool(t)
	userID := seedUser(t, pool)
	svc := NewService(NewRepository(pool))

	_, err := svc.Lookup(context.Background(), userID, "POST /x", "key-1", "hash-1")
	if err != ErrNotFound {
		t.Fatalf("Lookup() error = %v, want ErrNotFound", err)
	}
}

func TestService_StoreThenLookup_Replays(t *testing.T) {
	pool := testPool(t)
	userID := seedUser(t, pool)
	svc := NewService(NewRepository(pool))
	ctx := context.Background()

	body := []byte(`{"data":{"registration":{"id":"abc"}}}`)
	if err := svc.StoreOutcome(ctx, pool, userID, "POST /x", "key-1", "hash-1", 201, body); err != nil {
		t.Fatalf("StoreOutcome() error = %v", err)
	}

	rec, err := svc.Lookup(ctx, userID, "POST /x", "key-1", "hash-1")
	if err != nil {
		t.Fatalf("Lookup() error = %v", err)
	}
	if rec.ResponseStatus != 201 || !jsonEqual(t, rec.ResponseBody, body) {
		t.Fatalf("Lookup() = %+v, want status=201 body=%s", rec, body)
	}
}

func TestService_Lookup_ConflictOnDifferentHash(t *testing.T) {
	pool := testPool(t)
	userID := seedUser(t, pool)
	svc := NewService(NewRepository(pool))
	ctx := context.Background()

	if err := svc.StoreOutcome(ctx, pool, userID, "POST /x", "key-1", "hash-1", 201, []byte(`{}`)); err != nil {
		t.Fatalf("StoreOutcome() error = %v", err)
	}

	_, err := svc.Lookup(ctx, userID, "POST /x", "key-1", "hash-2")
	if err != ErrConflict {
		t.Fatalf("Lookup() error = %v, want ErrConflict", err)
	}
}

func TestService_StoreOutcome_RepeatIsNoOp(t *testing.T) {
	pool := testPool(t)
	userID := seedUser(t, pool)
	svc := NewService(NewRepository(pool))
	ctx := context.Background()

	if err := svc.StoreOutcome(ctx, pool, userID, "POST /x", "key-1", "hash-1", 201, []byte(`{"v":1}`)); err != nil {
		t.Fatalf("first StoreOutcome() error = %v", err)
	}
	// A repeat write (e.g. a retried best-effort store) must not error and must not
	// overwrite the first stored outcome.
	if err := svc.StoreOutcome(ctx, pool, userID, "POST /x", "key-1", "hash-1", 500, []byte(`{"v":2}`)); err != nil {
		t.Fatalf("second StoreOutcome() error = %v", err)
	}

	rec, err := svc.Lookup(ctx, userID, "POST /x", "key-1", "hash-1")
	if err != nil {
		t.Fatalf("Lookup() error = %v", err)
	}
	if rec.ResponseStatus != 201 || !jsonEqual(t, rec.ResponseBody, []byte(`{"v":1}`)) {
		t.Fatalf("Lookup() = %+v, want the first-written outcome to win", rec)
	}
}

func TestRepository_DeleteExpired(t *testing.T) {
	pool := testPool(t)
	userID := seedUser(t, pool)
	repo := NewRepository(pool)
	ctx := context.Background()

	if err := repo.Store(ctx, pool, Record{UserID: userID, Key: "old", Route: "POST /x", RequestHash: "h", ResponseStatus: 201, ResponseBody: []byte(`{}`)}); err != nil {
		t.Fatalf("Store() error = %v", err)
	}
	// Backdate it past expiry.
	if _, err := pool.Exec(ctx, `UPDATE idempotency_keys SET expires_at = now() - interval '1 hour' WHERE user_id=$1 AND key='old'`, userID); err != nil {
		t.Fatalf("backdate expiry: %v", err)
	}
	if err := repo.Store(ctx, pool, Record{UserID: userID, Key: "fresh", Route: "POST /x", RequestHash: "h", ResponseStatus: 201, ResponseBody: []byte(`{}`)}); err != nil {
		t.Fatalf("Store() error = %v", err)
	}

	n, err := repo.DeleteExpired(ctx, time.Now())
	if err != nil {
		t.Fatalf("DeleteExpired() error = %v", err)
	}
	if n != 1 {
		t.Fatalf("DeleteExpired() = %d, want 1", n)
	}

	if _, err := repo.Find(ctx, userID, "POST /x", "old"); err != ErrNotFound {
		t.Fatalf("Find(old) error = %v, want ErrNotFound", err)
	}
	if _, err := repo.Find(ctx, userID, "POST /x", "fresh"); err != nil {
		t.Fatalf("Find(fresh) error = %v, want nil", err)
	}
}
