package liveactivities

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testPool follows the same convention as registrations/repository_integration_test.go
// and events/repository_integration_test.go: skip unless DATABASE_URL is set, so a
// plain `go test ./...` run never touches a real database (and never truncates
// whatever dev data happens to be in it) unless the caller explicitly opts in.
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
	if _, err := pool.Exec(ctx, `TRUNCATE TABLE live_activities CASCADE`); err != nil {
		t.Fatalf("truncate live_activities: %v", err)
	}
	return pool
}

func seedUserAndEvent(t *testing.T, pool *pgxpool.Pool) (userID, eventID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	if err := pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'USER') RETURNING id`,
		uuid.New().String()+"@example.test").Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO events (name, slug, description, cover_image, event_date, start_time, location, status)
		VALUES ('Test Race', $1, '', '', now(), now(), '', 'REGISTRATION_OPEN') RETURNING id`,
		uuid.New().String()).Scan(&eventID); err != nil {
		t.Fatalf("seed event: %v", err)
	}
	return userID, eventID
}

// TestRepository_Create_EnforcesOneActivePerUserEvent is the test a fake
// repository can't give real confidence for: it proves the partial unique
// index (migrations/00034) actually rejects a concurrent-looking duplicate
// at the database layer, not just in application code that a second server
// instance or a race could bypass.
func TestRepository_Create_EnforcesOneActivePerUserEvent(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	userID, eventID := seedUserAndEvent(t, pool)
	in := CreateInput{EventID: eventID, ActivityID: "activity-1", PushToken: "token-1", Platform: "ios"}

	if _, err := repo.Create(context.Background(), userID, in); err != nil {
		t.Fatalf("first Create: %v", err)
	}
	_, err := repo.Create(context.Background(), userID, in)
	if !errors.Is(err, ErrDuplicateActive) {
		t.Fatalf("expected ErrDuplicateActive from the unique index, got %v", err)
	}
}

func TestRepository_Create_ThenEnd_AllowsANewActiveRow(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	userID, eventID := seedUserAndEvent(t, pool)
	in := CreateInput{EventID: eventID, ActivityID: "activity-1", PushToken: "token-1", Platform: "ios"}

	first, err := repo.Create(context.Background(), userID, in)
	if err != nil {
		t.Fatalf("first Create: %v", err)
	}
	if err := repo.End(context.Background(), first.ID); err != nil {
		t.Fatalf("End: %v", err)
	}
	// The partial unique index only covers status = 'ACTIVE', so a second
	// ACTIVE row for the same (user, event) is allowed once the first is ENDED.
	if _, err := repo.Create(context.Background(), userID, in); err != nil {
		t.Fatalf("Create after End should succeed, got: %v", err)
	}
}

func TestRepository_Create_ExpiresAfterActivityKitLimit(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	userID, eventID := seedUserAndEvent(t, pool)
	before := time.Now()
	activity, err := repo.Create(context.Background(), userID, CreateInput{
		EventID: eventID, ActivityID: "activity-1", Platform: "ios",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if activity.ExpiresAt == nil {
		t.Fatal("expires_at is nil")
	}
	want := before.Add(8 * time.Hour)
	if delta := activity.ExpiresAt.Sub(want); delta < -10*time.Second || delta > 10*time.Second {
		t.Fatalf("expires_at = %v, want near %v", activity.ExpiresAt, want)
	}
}

func TestRepository_Create_ReplacesExpiredActiveRowBeforeSweep(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	userID, eventID := seedUserAndEvent(t, pool)
	first, err := repo.Create(context.Background(), userID, CreateInput{
		EventID: eventID, ActivityID: "old", Platform: "ios",
	})
	if err != nil {
		t.Fatalf("first Create: %v", err)
	}
	if _, err := pool.Exec(context.Background(),
		`UPDATE live_activities SET expires_at = now() - interval '1 second' WHERE id = $1`, first.ID); err != nil {
		t.Fatalf("expire row: %v", err)
	}
	second, err := repo.Create(context.Background(), userID, CreateInput{
		EventID: eventID, ActivityID: "new", Platform: "ios",
	})
	if err != nil {
		t.Fatalf("Create after expiry: %v", err)
	}
	if second.ActivityID != "new" {
		t.Fatalf("activity_id = %q, want new", second.ActivityID)
	}
	active, err := repo.ListActiveForUser(context.Background(), userID)
	if err != nil {
		t.Fatalf("ListActiveForUser: %v", err)
	}
	if len(active) != 1 || active[0].ID != second.ID {
		t.Fatalf("active = %#v, want only new activity", active)
	}
}

func TestRepository_UpdateRaceStatus_OnEndedActivity_ReturnsNotFound(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	userID, eventID := seedUserAndEvent(t, pool)
	activity, err := repo.Create(context.Background(), userID, CreateInput{
		EventID: eventID, ActivityID: "activity-1", PushToken: "token-1", Platform: "ios",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := repo.End(context.Background(), activity.ID); err != nil {
		t.Fatalf("End: %v", err)
	}
	live := RaceLive
	_, err = repo.UpdateRaceStatus(context.Background(), activity.ID, UpdateInput{RaceStatus: &live})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("updating an ended activity should report not found, got: %v", err)
	}
}
