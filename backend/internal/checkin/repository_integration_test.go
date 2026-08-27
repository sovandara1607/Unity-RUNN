package checkin

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testPool opens a pool against DATABASE_URL and truncates the relevant tables before each test, mirroring the testPool pattern used in events/auth/registrations' integration tests
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

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE check_ins, registrations, registration_counters CASCADE`); err != nil {
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

// seedConfirmedRegistration creates a minimal event/category/user and a CONFIRMED registration directly via SQL, returning its ID
func seedConfirmedRegistration(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	ctx := context.Background()

	var eventID uuid.UUID
	err := pool.QueryRow(ctx, `
		INSERT INTO events (name, slug, event_date, start_time, status)
		VALUES ('Test Event', $1, '2026-01-01', '06:00', 'REGISTRATION_OPEN')
		RETURNING id`, uuid.NewString()).Scan(&eventID)
	if err != nil {
		t.Fatalf("seed event: %v", err)
	}

	var categoryID uuid.UUID
	err = pool.QueryRow(ctx, `
		INSERT INTO event_categories (event_id, name, distance, price_cents, capacity, status)
		VALUES ($1, '5K', '5K', 0, 100, 'OPEN') RETURNING id`, eventID).Scan(&categoryID)
	if err != nil {
		t.Fatalf("seed category: %v", err)
	}

	var userID uuid.UUID
	err = pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'USER') RETURNING id`,
		uuid.NewString()+"@test.local").Scan(&userID)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}

	var registrationID uuid.UUID
	err = pool.QueryRow(ctx, `
		INSERT INTO registrations (registration_number, user_id, event_id, event_category_id, status, full_name, email)
		VALUES ($1, $2, $3, $4, 'CONFIRMED', 'Test Runner', 'runner@test.local')
		RETURNING id`, "URC-TEST-"+uuid.NewString()[:6], userID, eventID, categoryID).Scan(&registrationID)
	if err != nil {
		t.Fatalf("seed registration: %v", err)
	}

	return registrationID
}

// TestRepository_Create_Succeeds tests the Create method that succeeds
func TestRepository_Create_Succeeds(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	registrationID := seedConfirmedRegistration(t, pool)
	staffID := seedStaffUser(t, pool)

	c, err := repo.Create(context.Background(), registrationID, staffID)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if c.RegistrationID != registrationID {
		t.Errorf("RegistrationID = %v, want %v", c.RegistrationID, registrationID)
	}
}

// TestRepository_Create_DuplicateRejected tests the Create method that rejects a duplicate
func TestRepository_Create_DuplicateRejected(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	registrationID := seedConfirmedRegistration(t, pool)
	staffID := seedStaffUser(t, pool)
	ctx := context.Background()

	if _, err := repo.Create(ctx, registrationID, staffID); err != nil {
		t.Fatalf("first Create() error = %v", err)
	}

	_, err := repo.Create(ctx, registrationID, staffID)
	if !errors.Is(err, ErrAlreadyCheckedIn) {
		t.Fatalf("second Create() error = %v, want ErrAlreadyCheckedIn", err)
	}
}

func seedStaffUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var staffID uuid.UUID
	err := pool.QueryRow(context.Background(), `
		INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'STAFF') RETURNING id`,
		uuid.NewString()+"@test.local").Scan(&staffID)
	if err != nil {
		t.Fatalf("seed staff user: %v", err)
	}
	return staffID
}

// TestRepository_ConcurrentCheckIn_ExactlyOneSucceeds proves the unique constraint on check_ins.registration_id is what actually prevents double check-in under real concurrency — same style as the Phase 4 capacity stress test
func TestRepository_ConcurrentCheckIn_ExactlyOneSucceeds(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	registrationID := seedConfirmedRegistration(t, pool)

	const attempts = 20
	staffIDs := make([]uuid.UUID, attempts)
	for i := range staffIDs {
		staffIDs[i] = seedStaffUser(t, pool)
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	succeeded := 0
	duplicateErrors := 0
	otherErrors := 0

	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(staffID uuid.UUID) {
			defer wg.Done()
			_, err := repo.Create(context.Background(), registrationID, staffID)
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				succeeded++
			case errors.Is(err, ErrAlreadyCheckedIn):
				duplicateErrors++
			default:
				otherErrors++
				t.Logf("unexpected error: %v", err)
			}
		}(staffIDs[i])
	}
	wg.Wait()

	if succeeded != 1 {
		t.Errorf("succeeded = %d, want exactly 1", succeeded)
	}
	if duplicateErrors != attempts-1 {
		t.Errorf("duplicateErrors = %d, want %d", duplicateErrors, attempts-1)
	}
	if otherErrors != 0 {
		t.Errorf("otherErrors = %d, want 0", otherErrors)
	}

	var finalCount int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM check_ins WHERE registration_id = $1`, registrationID).Scan(&finalCount); err != nil {
		t.Fatalf("count final check-ins: %v", err)
	}
	if finalCount != 1 {
		t.Errorf("final check-in count in DB = %d, want 1", finalCount)
	}
}
