//go:build integration

package registrations

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testPool opens a pool against DATABASE_URL and truncates the
// registration-related tables before each test, mirroring the
// testPool pattern in events/auth's integration tests.
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

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE registrations, registration_counters CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE TABLE events CASCADE`); err != nil {
		t.Fatalf("truncate events: %v", err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE TABLE users CASCADE`); err != nil {
		t.Fatalf("truncate users: %v", err)
	}

	return pool
}

// seedEventCategoryUser creates a minimal event + category + user
// directly via SQL (bypassing the events/auth packages, since this
// test only needs foreign keys to exist) and returns their IDs.
func seedEventCategoryUser(t *testing.T, pool *pgxpool.Pool, capacity int) (eventID, categoryID uuid.UUID) {
	t.Helper()
	ctx := context.Background()

	err := pool.QueryRow(ctx, `
		INSERT INTO events (name, slug, event_date, start_time, status)
		VALUES ('Test Event', $1, '2026-01-01', '06:00', 'REGISTRATION_OPEN')
		RETURNING id`, uuid.NewString()).Scan(&eventID)
	if err != nil {
		t.Fatalf("seed event: %v", err)
	}

	err = pool.QueryRow(ctx, `
		INSERT INTO event_categories (event_id, name, distance, price_cents, capacity, status)
		VALUES ($1, '5K', '5K', 0, $2, 'OPEN')
		RETURNING id`, eventID, capacity).Scan(&categoryID)
	if err != nil {
		t.Fatalf("seed category: %v", err)
	}

	return eventID, categoryID
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

func testParticipant() ParticipantInfo {
	return ParticipantInfo{FullName: "Test Runner", Email: "runner@unityrunclub.com", TshirtSize: "M"}
}

func TestRepository_Create_RegistrationNumberFormat(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	eventID, categoryID := seedEventCategoryUser(t, pool, 10)
	userID := seedUser(t, pool)

	res, err := repo.Create(context.Background(), CreateParams{
		UserID: userID, EventID: eventID, EventCategoryID: categoryID, Capacity: 10,
		Participant: testParticipant(), Confirm: true, TicketTokenHash: "hash1",
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	year := time.Now().UTC().Year()
	want := fmt.Sprintf("URC-%d-000001", year)
	if res.Registration.RegistrationNumber != want {
		t.Errorf("RegistrationNumber = %q, want %q", res.Registration.RegistrationNumber, want)
	}
	if res.Ticket == nil {
		t.Fatal("expected a ticket for a Confirm:true registration")
	}
}

func TestRepository_Create_DuplicateActiveRegistrationRejected(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	eventID, categoryID := seedEventCategoryUser(t, pool, 10)
	userID := seedUser(t, pool)
	ctx := context.Background()

	params := CreateParams{UserID: userID, EventID: eventID, EventCategoryID: categoryID,
		Capacity: 10, Participant: testParticipant(), Confirm: true, TicketTokenHash: "hash1"}

	if _, err := repo.Create(ctx, params); err != nil {
		t.Fatalf("first Create() error = %v", err)
	}

	params.TicketTokenHash = "hash2"
	_, err := repo.Create(ctx, params)
	if !errors.Is(err, ErrDuplicateRegistration) {
		t.Fatalf("second Create() error = %v, want ErrDuplicateRegistration", err)
	}
}

func TestRepository_Create_CapacityFullRejected(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	eventID, categoryID := seedEventCategoryUser(t, pool, 1)
	ctx := context.Background()

	u1 := seedUser(t, pool)
	if _, err := repo.Create(ctx, CreateParams{UserID: u1, EventID: eventID, EventCategoryID: categoryID,
		Capacity: 1, Participant: testParticipant(), Confirm: true, TicketTokenHash: "h1"}); err != nil {
		t.Fatalf("first Create() error = %v", err)
	}

	u2 := seedUser(t, pool)
	_, err := repo.Create(ctx, CreateParams{UserID: u2, EventID: eventID, EventCategoryID: categoryID,
		Capacity: 1, Participant: testParticipant(), Confirm: true, TicketTokenHash: "h2"})
	if !errors.Is(err, ErrCapacityFull) {
		t.Fatalf("second Create() error = %v, want ErrCapacityFull", err)
	}
}

func TestRepository_Cancel_FreesCapacity(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	eventID, categoryID := seedEventCategoryUser(t, pool, 1)
	ctx := context.Background()

	u1 := seedUser(t, pool)
	res, err := repo.Create(ctx, CreateParams{UserID: u1, EventID: eventID, EventCategoryID: categoryID,
		Capacity: 1, Participant: testParticipant(), Confirm: true, TicketTokenHash: "h1"})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if err := repo.Cancel(ctx, res.Registration.ID); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}

	u2 := seedUser(t, pool)
	_, err = repo.Create(ctx, CreateParams{UserID: u2, EventID: eventID, EventCategoryID: categoryID,
		Capacity: 1, Participant: testParticipant(), Confirm: true, TicketTokenHash: "h2"})
	if err != nil {
		t.Fatalf("Create() after cancel error = %v", err)
	}
}

// TestRepository_ConcurrentRegistration_NeverExceedsCapacity is the
// core correctness proof for this phase: N goroutines race to
// register for a category with capacity much smaller than N. Exactly
// `capacity` must succeed; the rest must fail with ErrCapacityFull.
// This exercises the FOR UPDATE row lock directly against real
// Postgres — no Redis lock is used here, so this proves Postgres
// alone is sufficient for correctness.
func TestRepository_ConcurrentRegistration_NeverExceedsCapacity(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)

	const capacity = 5
	const attempts = 30

	eventID, categoryID := seedEventCategoryUser(t, pool, capacity)

	userIDs := make([]uuid.UUID, attempts)
	for i := range userIDs {
		userIDs[i] = seedUser(t, pool)
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	succeeded := 0
	capacityErrors := 0
	otherErrors := 0

	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(userID uuid.UUID, idx int) {
			defer wg.Done()
			_, err := repo.Create(context.Background(), CreateParams{
				UserID: userID, EventID: eventID, EventCategoryID: categoryID, Capacity: capacity,
				Participant: testParticipant(), Confirm: true, TicketTokenHash: fmt.Sprintf("hash-%d", idx),
			})
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				succeeded++
			case errors.Is(err, ErrCapacityFull):
				capacityErrors++
			default:
				otherErrors++
				t.Logf("unexpected error: %v", err)
			}
		}(userIDs[i], i)
	}
	wg.Wait()

	if succeeded != capacity {
		t.Errorf("succeeded = %d, want exactly %d", succeeded, capacity)
	}
	if capacityErrors != attempts-capacity {
		t.Errorf("capacityErrors = %d, want %d", capacityErrors, attempts-capacity)
	}
	if otherErrors != 0 {
		t.Errorf("otherErrors = %d, want 0", otherErrors)
	}

	// Confirm against the database directly too, not just in-process counters.
	var finalCount int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM registrations WHERE event_category_id = $1 AND status = 'CONFIRMED'`,
		categoryID).Scan(&finalCount); err != nil {
		t.Fatalf("count final registrations: %v", err)
	}
	if finalCount != capacity {
		t.Errorf("final confirmed count in DB = %d, want %d", finalCount, capacity)
	}
}
