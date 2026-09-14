// Command loadtestseed provisions the data the k6 scenarios under /k6 need:
// a batch of test user accounts (with pre-minted JWTs, so the burst test
// measures the registration endpoint rather than the login endpoint's own
// rate limiter and bcrypt cost) and one load-test event with a free category
// at a configurable capacity. A -paid mode additionally seeds already-PENDING
// paid registrations for the payment-verify duplicate-call scenario.
//
// Safe to re-run: users and the event/category are keyed so a repeat run
// reuses the same rows instead of duplicating them.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/unity-run-club/api/internal/auth"
)

const (
	loadTestEventSlug   = "loadtest-event"
	loadTestPassword    = "LoadTest#12345" // fixed, hashed once and reused for every seeded user — throwaway test accounts only
	loadTestEmailDomain = "unityrunclub.loadtest"
	tokenTTL            = 24 * time.Hour
)

type seededUser struct {
	UserID string `json:"user_id"`
	Token  string `json:"token"`
}

func main() {
	users := flag.Int("users", 2000, "number of test user accounts to seed/reuse")
	capacity := flag.Int("capacity", 1000, "capacity of the seeded free-category load-test event")
	priceCents := flag.Int("paid-price-cents", 500, "price of the paid category seeded with -paid")
	paid := flag.Bool("paid", false, "also seed a paid category with pending registrations/payments for scenario C")
	paidCount := flag.Int("paid-count", 50, "number of pending paid registrations to seed with -paid")
	usersOut := flag.String("users-out", "k6/users.json", "output path for {user_id, token} pairs")
	eventOut := flag.String("event-out", "k6/event.json", "output path for event/category ids")
	verify := flag.Bool("verify", false, "verify mode: check the true active-registration count for -category-id equals -expect")
	categoryID := flag.String("category-id", "", "verify mode: event_category_id to count")
	expect := flag.Int("expect", 0, "verify mode: expected active (PENDING+CONFIRMED) registration count")
	flag.Parse()

	if err := run(*users, *capacity, *priceCents, *paid, *paidCount, *usersOut, *eventOut, *verify, *categoryID, *expect); err != nil {
		log.Fatal(err)
	}
}

func run(users, capacity, priceCents int, paid bool, paidCount int, usersOut, eventOut string, verify bool, categoryID string, expect int) error {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return errors.New("DATABASE_URL is not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer pool.Close()

	if verify {
		return runVerify(ctx, pool, categoryID, expect)
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return errors.New("JWT_SECRET is not set (must match the server you're load-testing)")
	}
	tokens := auth.NewTokenIssuer(jwtSecret, tokenTTL)

	log.Printf("seeding %d users (this hashes the shared test password once, then reuses the hash — expect this to take seconds, not minutes)", users)
	hash, err := bcrypt.GenerateFromPassword([]byte(loadTestPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	seeded, err := seedUsers(ctx, pool, users, string(hash), tokens)
	if err != nil {
		return fmt.Errorf("seed users: %w", err)
	}
	if err := writeJSON(usersOut, seeded); err != nil {
		return fmt.Errorf("write %s: %w", usersOut, err)
	}
	log.Printf("wrote %d users to %s", len(seeded), usersOut)

	eventID, freeCategoryID, err := seedEvent(ctx, pool, capacity)
	if err != nil {
		return fmt.Errorf("seed event: %w", err)
	}

	out := map[string]any{
		"event_id": eventID,
		// slug is what GET /api/v1/events/{id} actually expects — that route
		// is a slug lookup, unlike POST .../registrations which takes the
		// real event UUID. Both are provided so k6 scripts don't have to guess.
		"slug":        loadTestEventSlug,
		"category_id": freeCategoryID,
		"capacity":    capacity,
	}

	if paid {
		paidCategoryID, err := seedPaidCategory(ctx, pool, eventID, priceCents)
		if err != nil {
			return fmt.Errorf("seed paid category: %w", err)
		}
		n := paidCount
		if n > len(seeded) {
			n = len(seeded)
		}
		// Use the tail of the user pool, not the head: a user can only hold one
		// active registration per event, so scenario B (which drives VUs 1..N
		// against the free category of this same event) must not collide with
		// the users used here for the paid category.
		regIDs, paymentIDs, err := seedPendingPaidRegistrations(ctx, pool, eventID, paidCategoryID, seeded[len(seeded)-n:])
		if err != nil {
			return fmt.Errorf("seed pending paid registrations: %w", err)
		}
		out["paid_category_id"] = paidCategoryID
		out["pending_registration_ids"] = regIDs
		out["pending_payment_ids"] = paymentIDs
		log.Printf("seeded %d pending paid registrations against category %s", len(regIDs), paidCategoryID)
	}

	if err := writeJSON(eventOut, out); err != nil {
		return fmt.Errorf("write %s: %w", eventOut, err)
	}
	log.Printf("wrote event/category ids to %s: %+v", eventOut, out)
	return nil
}

// seedUsers inserts (or reuses) `count` users with a fixed, shared password
// hash, via a pipelined batch so seeding thousands of rows doesn't cost
// thousands of network round trips, then mints a JWT for each directly
// (bypassing login's rate limiter and real bcrypt cost, so the load test
// measures the registration endpoint, not login).
func seedUsers(ctx context.Context, pool *pgxpool.Pool, count int, passwordHash string, tokens *auth.TokenIssuer) ([]seededUser, error) {
	batch := &pgx.Batch{}
	for i := 0; i < count; i++ {
		email := fmt.Sprintf("loadtest-user-%05d@%s", i, loadTestEmailDomain)
		batch.Queue(`
			INSERT INTO users (email, password_hash, role)
			VALUES ($1, $2, 'USER')
			ON CONFLICT (email) DO UPDATE SET updated_at = now()
			RETURNING id`, email, passwordHash)
	}

	br := pool.SendBatch(ctx, batch)
	defer br.Close()

	out := make([]seededUser, 0, count)
	for i := 0; i < count; i++ {
		var userID uuid.UUID
		if err := br.QueryRow().Scan(&userID); err != nil {
			return nil, fmt.Errorf("insert user %d: %w", i, err)
		}
		token, err := tokens.GenerateAccessToken(userID, auth.RoleUser)
		if err != nil {
			return nil, fmt.Errorf("mint token for user %d: %w", i, err)
		}
		out = append(out, seededUser{UserID: userID.String(), Token: token})
	}
	return out, br.Close()
}

// seedEvent creates (or reuses) one open, free-tier load-test event/category.
func seedEvent(ctx context.Context, pool *pgxpool.Pool, capacity int) (eventID, categoryID string, err error) {
	now := time.Now().UTC()
	err = pool.QueryRow(ctx, `
		INSERT INTO events (name, slug, event_date, start_time, status, registration_open_at, registration_close_at)
		VALUES ('Load Test Event', $1, $2, '06:00', 'REGISTRATION_OPEN', $3, $4)
		ON CONFLICT (slug) DO UPDATE SET status = 'REGISTRATION_OPEN', updated_at = now()
		RETURNING id`,
		loadTestEventSlug, now.AddDate(0, 0, 30).Format("2006-01-02"), now.AddDate(0, 0, -1), now.AddDate(0, 0, 29),
	).Scan(&eventID)
	if err != nil {
		return "", "", fmt.Errorf("upsert event: %w", err)
	}

	err = pool.QueryRow(ctx, `
		INSERT INTO event_categories (event_id, name, distance, price_cents, currency, capacity, status)
		VALUES ($1, 'Load Test Free', '5K', 0, 'USD', $2, 'OPEN')
		ON CONFLICT (event_id, name) DO UPDATE SET capacity = EXCLUDED.capacity, status = 'OPEN', updated_at = now()
		RETURNING id`, eventID, capacity,
	).Scan(&categoryID)
	if err != nil {
		return "", "", fmt.Errorf("upsert category: %w", err)
	}
	return eventID, categoryID, nil
}

func seedPaidCategory(ctx context.Context, pool *pgxpool.Pool, eventID string, priceCents int) (string, error) {
	var categoryID string
	err := pool.QueryRow(ctx, `
		INSERT INTO event_categories (event_id, name, distance, price_cents, currency, capacity, status)
		VALUES ($1, 'Load Test Paid', '10K', $2, 'USD', 100000, 'OPEN')
		ON CONFLICT (event_id, name) DO UPDATE SET price_cents = EXCLUDED.price_cents, status = 'OPEN', updated_at = now()
		RETURNING id`, eventID, priceCents,
	).Scan(&categoryID)
	return categoryID, err
}

// seedPendingPaidRegistrations directly inserts already-PENDING registrations
// and payments (bypassing the API and the mock provider, which always
// settles immediately) so scenario C has something to send duplicate
// payment-verify calls against.
func seedPendingPaidRegistrations(ctx context.Context, pool *pgxpool.Pool, eventID, categoryID string, users []seededUser) (regIDs, paymentIDs []string, err error) {
	for i, u := range users {
		var regID string
		err = pool.QueryRow(ctx, `
			INSERT INTO registrations (registration_number, user_id, event_id, event_category_id, status, full_name, email)
			VALUES ($1, $2, $3, $4, 'PENDING', 'Load Test Paid User', 'loadtest-paid@unityrunclub.loadtest')
			ON CONFLICT DO NOTHING
			RETURNING id`,
			fmt.Sprintf("URC-LOADTEST-PAID-%05d", i), u.UserID, eventID, categoryID,
		).Scan(&regID)
		if errors.Is(err, pgx.ErrNoRows) {
			continue // this user already has an active registration for this event from a prior run
		}
		if err != nil {
			return nil, nil, fmt.Errorf("insert pending registration %d: %w", i, err)
		}

		ref, err2 := randomHex(16)
		if err2 != nil {
			return nil, nil, err2
		}
		var paymentID string
		if err := pool.QueryRow(ctx, `
			INSERT INTO payments (registration_id, provider, provider_reference, amount_cents, currency, status, expires_at)
			VALUES ($1, 'mock', $2, 500, 'USD', 'PENDING', now() + interval '1 hour')
			RETURNING id`, regID, ref,
		).Scan(&paymentID); err != nil {
			return nil, nil, fmt.Errorf("insert pending payment %d: %w", i, err)
		}
		regIDs = append(regIDs, regID)
		paymentIDs = append(paymentIDs, paymentID)
	}
	return regIDs, paymentIDs, nil
}

func runVerify(ctx context.Context, pool *pgxpool.Pool, categoryID string, expect int) error {
	if categoryID == "" {
		return errors.New("-verify requires -category-id")
	}
	var active int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM registrations
		WHERE event_category_id = $1 AND status IN ('PENDING', 'CONFIRMED')`, categoryID).Scan(&active); err != nil {
		return fmt.Errorf("count active registrations: %w", err)
	}
	if active != expect {
		return fmt.Errorf("FAIL: category %s has %d active registrations, want exactly %d", categoryID, active, expect)
	}
	log.Printf("PASS: category %s has exactly %d active registrations", categoryID, active)
	return nil
}

func writeJSON(path string, v any) error {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
