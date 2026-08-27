package auditlog

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

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

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE audit_logs`); err != nil {
		t.Fatalf("truncate audit_logs: %v", err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE TABLE users CASCADE`); err != nil {
		t.Fatalf("truncate users: %v", err)
	}

	return pool
}

// seedUser creates a minimal user row and returns its ID
func seedUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var userID uuid.UUID
	err := pool.QueryRow(context.Background(), `
		INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'STAFF') RETURNING id`,
		uuid.NewString()+"@test.local").Scan(&userID)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return userID
}

func TestRepository_InsertAndListByEntity(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	actorID := seedUser(t, pool)
	entityID := uuid.New()

	entry := &Entry{
		ActorID: &actorID, Action: "check_in_succeeded", EntityType: "registration",
		EntityID: &entityID, Metadata: map[string]any{"foo": "bar"},
	}
	if err := repo.Insert(ctx, entry); err != nil {
		t.Fatalf("Insert() error = %v", err)
	}
	if entry.ID.String() == "" {
		t.Fatal("expected ID to be populated after Insert")
	}

	entries, err := repo.ListByEntity(ctx, "registration", entityID)
	if err != nil {
		t.Fatalf("ListByEntity() error = %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(entries))
	}
	if entries[0].Action != "check_in_succeeded" {
		t.Errorf("Action = %q, want %q", entries[0].Action, "check_in_succeeded")
	}
	if entries[0].Metadata["foo"] != "bar" {
		t.Errorf("Metadata = %+v, want foo=bar", entries[0].Metadata)
	}
}
