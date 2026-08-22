// Command seed inserts one example Unity Run Club event (with a
// category, schedule, FAQs, and rules) for local development. It is
// idempotent: re-running it upserts by slug instead of erroring.
package main

import (
	"context"
	"errors"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const seedSlug = "unity-founders-run-2025"

var errNoDatabaseURL = errors.New("DATABASE_URL is not set")

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return errNoDatabaseURL
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var eventID string
	err = tx.QueryRow(ctx, `
		INSERT INTO events (
			name, slug, description, cover_image, event_date, start_time, location,
			latitude, longitude, registration_open_at, registration_close_at, status
		) VALUES (
			'Unity Founders Run 2025', $1,
			'The run that started it all — Unity Run Club''s inaugural community run through Phnom Penh, celebrating our first year of bringing runners together.',
			'https://assets.unityrunclub.com/events/founders-run-2025/cover.jpg',
			'2025-12-06', '06:00', 'Diamond Island, Phnom Penh',
			11.5564, 104.9282,
			'2025-10-01T00:00:00Z', '2025-12-01T23:59:59Z',
			'PUBLISHED'
		)
		ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
		RETURNING id`, seedSlug).Scan(&eventID)
	if err != nil {
		return err
	}

	// Clear and re-insert child rows so re-running stays idempotent
	// without needing per-row upsert keys.
	for _, table := range []string{"event_categories", "event_schedules", "event_faqs", "event_rules"} {
		if _, err := tx.Exec(ctx, "DELETE FROM "+table+" WHERE event_id = $1", eventID); err != nil {
			return err
		}
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO event_categories (event_id, name, distance, price_cents, capacity, registration_deadline, status)
		VALUES
			($1, '5K', '5K', 500000, 300, '2025-12-01T23:59:59Z', 'OPEN'),
			($1, '10K', '10K', 800000, 200, '2025-12-01T23:59:59Z', 'OPEN'),
			($1, 'Fun Run', '3K', 0, 500, '2025-12-01T23:59:59Z', 'OPEN')`, eventID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO event_schedules (event_id, time, title, description, sort_order)
		VALUES
			($1, '05:00', 'Bib pickup opens', 'Collect your race bib and t-shirt at the registration tent.', 1),
			($1, '06:00', 'Race start', 'All categories start together, waved off by distance.', 2),
			($1, '08:00', 'Awards & community breakfast', 'Podium ceremony followed by breakfast for all finishers.', 3)`, eventID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO event_faqs (event_id, question, answer, sort_order)
		VALUES
			($1, 'Is there parking at the venue?', 'Yes, free parking is available at Diamond Island Convention Center.', 1),
			($1, 'Can I transfer my registration to someone else?', 'Transfers are allowed up to 7 days before the event — contact us via the community page.', 2)`, eventID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO event_rules (event_id, rule, sort_order)
		VALUES
			($1, 'All participants must wear their race bib visibly at all times.', 1),
			($1, 'Headphones at low volume are permitted; stay aware of your surroundings.', 2),
			($1, 'Course cut-off time is 2 hours from the start gun.', 3)`, eventID)
	if err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	log.Printf("seeded event %q (id=%s)", seedSlug, eventID)
	return nil
}
