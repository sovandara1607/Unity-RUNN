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
	"golang.org/x/crypto/bcrypt"
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

	// Dates are relative to "now" (not hardcoded) so the seeded event
	// is always a genuinely usable, registration-open demo event,
	// regardless of when `make seed` is run.
	now := time.Now().UTC()
	eventDate := now.AddDate(0, 0, 90).Format("2006-01-02")
	registrationOpenAt := now.AddDate(0, 0, -7)
	registrationCloseAt := now.AddDate(0, 0, 85)
	categoryDeadline := registrationCloseAt

	var eventID string
	err = tx.QueryRow(ctx, `
		INSERT INTO events (
			name, slug, description, cover_image, event_date, start_time, location,
			latitude, longitude, registration_open_at, registration_close_at, status
		) VALUES (
			'Unity Founders Run 2025', $1,
			'The run that started it all — Unity Run Club''s inaugural community run through Phnom Penh, celebrating our first year of bringing runners together.',
			'https://assets.unityrunclub.com/events/founders-run-2025/cover.jpg',
			$2, '06:00', 'Diamond Island, Phnom Penh',
			11.5564, 104.9282,
			$3, $4,
			'REGISTRATION_OPEN'
		)
		ON CONFLICT (slug) DO UPDATE SET
			name = EXCLUDED.name,
			event_date = EXCLUDED.event_date,
			registration_open_at = EXCLUDED.registration_open_at,
			registration_close_at = EXCLUDED.registration_close_at,
			status = EXCLUDED.status
		RETURNING id`, seedSlug, eventDate, registrationOpenAt, registrationCloseAt).Scan(&eventID)
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

	// price_cents is USD cents: 1500 = $15.00, 2500 = $25.00.
	_, err = tx.Exec(ctx, `
		INSERT INTO event_categories (event_id, name, distance, price_cents, capacity, registration_deadline, status)
		VALUES
			($1, '5K', '5K', 1500, 300, $2, 'OPEN'),
			($1, '10K', '10K', 2500, 200, $2, 'OPEN'),
			($1, 'Fun Run', '3K', 0, 500, $2, 'OPEN')`, eventID, categoryDeadline)
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

	// Seed default accounts (admin, staff, runner)
	type seedUser struct {
		email    string
		password string
		role     string
		fullName string
	}

	usersToSeed := []seedUser{
		{email: "admin@unityrunclub.com", password: "admin12345", role: "SUPER_ADMIN", fullName: "Admin Organizer"},
		{email: "staff@unityrunclub.com", password: "staff12345", role: "STAFF", fullName: "Staff Volunteer"},
		{email: "runner@unityrunclub.com", password: "runner12345", role: "USER", fullName: "Demo Runner"},
	}

	for _, u := range usersToSeed {
		hash, err := bcrypt.GenerateFromPassword([]byte(u.password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}

		var userID string
		err = pool.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, role)
			VALUES ($1, $2, $3)
			ON CONFLICT (email) DO UPDATE SET
				password_hash = EXCLUDED.password_hash,
				role = EXCLUDED.role,
				updated_at = now()
			RETURNING id`, u.email, string(hash), u.role).Scan(&userID)
		if err != nil {
			return err
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO profiles (user_id, full_name, phone, gender, emergency_contact_name, emergency_contact_phone, tshirt_size)
			VALUES ($1, $2, '+855 12 345 678', 'OTHER', 'Emergency Contact', '+855 98 765 432', 'L')
			ON CONFLICT (user_id) DO UPDATE SET
				full_name = EXCLUDED.full_name,
				updated_at = now()`, userID, u.fullName)
		if err != nil {
			return err
		}

		log.Printf("seeded user %q (role=%s, password=%s)", u.email, u.role, u.password)
	}

	return nil
}
