package registrations

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a registration, payment, or ticket
// doesn't exist.
var ErrNotFound = errors.New("registrations: not found")

// ErrDuplicateRegistration is returned when a user already has an
// active registration for the event (enforced by both the partial
// unique index and this check, belt-and-suspenders).
var ErrDuplicateRegistration = errors.New("registrations: user already has an active registration for this event")

// ErrCapacityFull is returned when a category has no remaining spots.
var ErrCapacityFull = errors.New("registrations: category is at capacity")

// Repository persists registrations, payments, and tickets in
// PostgreSQL. It also owns the one query that reads (and locks) the
// event_categories table directly — the FOR UPDATE capacity check
// must run inside the same transaction as the registration insert and
// counter increment, which isn't possible through the events
// package's own repository (it doesn't expose transactions).
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository builds a Repository backed by pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// HasActiveRegistration reports whether userID already has a
// non-cancelled registration for eventID.
func (r *Repository) HasActiveRegistration(ctx context.Context, userID, eventID uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM registrations
			WHERE user_id = $1 AND event_id = $2 AND status != 'CANCELLED'
		)`, userID, eventID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("registrations: check active registration: %w", err)
	}
	return exists, nil
}

// CreateResult bundles everything a successful registration produces.
type CreateResult struct {
	Registration Registration
	Ticket       *Ticket // nil if the registration didn't confirm immediately
}

// CreateParams bundles the inputs to Create.
type CreateParams struct {
	UserID          uuid.UUID
	EventID         uuid.UUID
	EventCategoryID uuid.UUID
	Capacity        int // the category's capacity, for the in-transaction check
	Participant     ParticipantInfo
	// Confirm, when true, marks the registration CONFIRMED and issues a
	// ticket immediately (free category, or payment already succeeded
	// synchronously via the mock provider). When false the registration
	// is created PENDING and no ticket is issued yet.
	Confirm bool
	// TicketTokenHash, when Confirm is true, is the SHA-256 hash of the
	// raw QR token to persist (the raw token itself is never stored).
	TicketTokenHash string
}

// Create runs the whole registration transaction: locks the category
// row (FOR UPDATE), counts active registrations against capacity,
// allocates the next registration number for the current year, and
// inserts the registration (and, if Confirm, a ticket). Capacity is
// enforced here — this is the authoritative check; any Redis-side
// lock is purely a fast-fail optimization applied before this is
// ever called.
func (r *Repository) Create(ctx context.Context, p CreateParams) (*CreateResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("registrations: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Lock the category row so concurrent registrations for the same
	// category serialize here — this is what makes the capacity check
	// below race-free.
	var lockedCapacity int
	err = tx.QueryRow(ctx, `SELECT capacity FROM event_categories WHERE id = $1 FOR UPDATE`,
		p.EventCategoryID).Scan(&lockedCapacity)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("registrations: lock category: %w", err)
	}

	var activeCount int
	err = tx.QueryRow(ctx, `
		SELECT count(*) FROM registrations
		WHERE event_category_id = $1 AND status IN ('PENDING', 'CONFIRMED')`,
		p.EventCategoryID).Scan(&activeCount)
	if err != nil {
		return nil, fmt.Errorf("registrations: count active: %w", err)
	}
	if activeCount >= lockedCapacity {
		return nil, ErrCapacityFull
	}

	regNumber, err := nextRegistrationNumber(ctx, tx)
	if err != nil {
		return nil, err
	}

	status := StatusPending
	if p.Confirm {
		status = StatusConfirmed
	}

	var reg Registration
	err = tx.QueryRow(ctx, `
		INSERT INTO registrations (
			registration_number, user_id, event_id, event_category_id, status,
			full_name, email, phone, date_of_birth, gender,
			emergency_contact_name, emergency_contact_phone, tshirt_size
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id, registration_number, user_id, event_id, event_category_id, status,
		          full_name, email, phone, date_of_birth, gender,
		          emergency_contact_name, emergency_contact_phone, tshirt_size,
		          created_at, updated_at`,
		regNumber, p.UserID, p.EventID, p.EventCategoryID, status,
		p.Participant.FullName, p.Participant.Email, p.Participant.Phone, p.Participant.DateOfBirth,
		p.Participant.Gender, p.Participant.EmergencyContactName, p.Participant.EmergencyContactPhone,
		p.Participant.TshirtSize,
	).Scan(&reg.ID, &reg.RegistrationNumber, &reg.UserID, &reg.EventID, &reg.EventCategoryID, &reg.Status,
		&reg.FullName, &reg.Email, &reg.Phone, &reg.DateOfBirth, &reg.Gender,
		&reg.EmergencyContactName, &reg.EmergencyContactPhone, &reg.TshirtSize,
		&reg.CreatedAt, &reg.UpdatedAt)
	if isUniqueViolation(err) {
		return nil, ErrDuplicateRegistration
	}
	if err != nil {
		return nil, fmt.Errorf("registrations: insert: %w", err)
	}

	result := &CreateResult{Registration: reg}

	if p.Confirm {
		var ticket Ticket
		err = tx.QueryRow(ctx, `
			INSERT INTO tickets (registration_id, token_hash)
			VALUES ($1, $2)
			RETURNING id, registration_id, token_hash, issued_at, created_at, updated_at`,
			reg.ID, p.TicketTokenHash,
		).Scan(&ticket.ID, &ticket.RegistrationID, &ticket.TokenHash, &ticket.IssuedAt,
			&ticket.CreatedAt, &ticket.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("registrations: insert ticket: %w", err)
		}
		result.Ticket = &ticket
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("registrations: commit: %w", err)
	}
	return result, nil
}

// nextRegistrationNumber atomically allocates and formats the next
// URC-YYYY-000001-style number for the current year, inside tx — a
// rollback (e.g. capacity full) rolls this back too, so numbers never
// leak gaps from failed attempts.
func nextRegistrationNumber(ctx context.Context, tx pgx.Tx) (string, error) {
	year := time.Now().UTC().Year()

	var nextValue int
	err := tx.QueryRow(ctx, `
		INSERT INTO registration_counters (year, last_value)
		VALUES ($1, 1)
		ON CONFLICT (year) DO UPDATE SET last_value = registration_counters.last_value + 1
		RETURNING last_value`, year).Scan(&nextValue)
	if err != nil {
		return "", fmt.Errorf("registrations: allocate number: %w", err)
	}

	return fmt.Sprintf("URC-%d-%06d", year, nextValue), nil
}

// GetByID fetches a registration by ID.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Registration, error) {
	const query = `
		SELECT id, registration_number, user_id, event_id, event_category_id, status,
		       full_name, email, phone, date_of_birth, gender,
		       emergency_contact_name, emergency_contact_phone, tshirt_size,
		       created_at, updated_at
		FROM registrations WHERE id = $1`

	var reg Registration
	err := r.pool.QueryRow(ctx, query, id).Scan(&reg.ID, &reg.RegistrationNumber, &reg.UserID,
		&reg.EventID, &reg.EventCategoryID, &reg.Status, &reg.FullName, &reg.Email, &reg.Phone,
		&reg.DateOfBirth, &reg.Gender, &reg.EmergencyContactName, &reg.EmergencyContactPhone,
		&reg.TshirtSize, &reg.CreatedAt, &reg.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("registrations: get by id: %w", err)
	}
	return &reg, nil
}

// ListForUser returns all registrations belonging to userID, most
// recent first.
func (r *Repository) ListForUser(ctx context.Context, userID uuid.UUID) ([]Registration, error) {
	const query = `
		SELECT id, registration_number, user_id, event_id, event_category_id, status,
		       full_name, email, phone, date_of_birth, gender,
		       emergency_contact_name, emergency_contact_phone, tshirt_size,
		       created_at, updated_at
		FROM registrations WHERE user_id = $1 ORDER BY created_at DESC`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("registrations: list for user: %w", err)
	}
	defer rows.Close()

	var out []Registration
	for rows.Next() {
		var reg Registration
		if err := rows.Scan(&reg.ID, &reg.RegistrationNumber, &reg.UserID, &reg.EventID,
			&reg.EventCategoryID, &reg.Status, &reg.FullName, &reg.Email, &reg.Phone,
			&reg.DateOfBirth, &reg.Gender, &reg.EmergencyContactName, &reg.EmergencyContactPhone,
			&reg.TshirtSize, &reg.CreatedAt, &reg.UpdatedAt); err != nil {
			return nil, fmt.Errorf("registrations: scan: %w", err)
		}
		out = append(out, reg)
	}
	return out, rows.Err()
}

// Cancel marks a registration CANCELLED, freeing its capacity slot.
// Returns ErrNotFound if the registration doesn't exist, or a
// wrapped error if it's already cancelled/refunded (checked by the
// caller via GetByID first — this just performs the update).
func (r *Repository) Cancel(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE registrations SET status = 'CANCELLED', updated_at = now() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("registrations: cancel: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CountActive returns how many PENDING/CONFIRMED registrations exist
// for a category — the raw number behind the availability endpoint.
func (r *Repository) CountActive(ctx context.Context, categoryID uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT count(*) FROM registrations
		WHERE event_category_id = $1 AND status IN ('PENDING', 'CONFIRMED')`,
		categoryID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("registrations: count active for category: %w", err)
	}
	return count, nil
}

// CreatePayment inserts a payment record for a registration.
func (r *Repository) CreatePayment(ctx context.Context, p *Payment) error {
	const query = `
		INSERT INTO payments (registration_id, provider, provider_reference, amount_cents, currency, status)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, created_at, updated_at`
	return r.pool.QueryRow(ctx, query, p.RegistrationID, p.Provider, p.ProviderReference,
		p.AmountCents, p.Currency, p.Status).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
}

// ConfirmWithPayment records a succeeded payment, flips a PENDING
// registration to CONFIRMED, and issues its ticket — all in one
// transaction. Used for the paid-registration path: the registration
// row is reserved as PENDING at Create time (occupying its capacity
// slot immediately), then confirmed here once payment succeeds. A
// real (async/webhook-driven) payment provider would call this same
// method from its webhook handler — the registration logic doesn't
// change based on whether confirmation is synchronous or async.
func (r *Repository) ConfirmWithPayment(ctx context.Context, registrationID uuid.UUID, payment *Payment, ticketTokenHash string) (*CreateResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("registrations: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	payment.RegistrationID = registrationID
	err = tx.QueryRow(ctx, `
		INSERT INTO payments (registration_id, provider, provider_reference, amount_cents, currency, status)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, created_at, updated_at`,
		payment.RegistrationID, payment.Provider, payment.ProviderReference,
		payment.AmountCents, payment.Currency, payment.Status,
	).Scan(&payment.ID, &payment.CreatedAt, &payment.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("registrations: insert payment: %w", err)
	}

	var reg Registration
	err = tx.QueryRow(ctx, `
		UPDATE registrations SET status = 'CONFIRMED', updated_at = now()
		WHERE id = $1 AND status = 'PENDING'
		RETURNING id, registration_number, user_id, event_id, event_category_id, status,
		          full_name, email, phone, date_of_birth, gender,
		          emergency_contact_name, emergency_contact_phone, tshirt_size,
		          created_at, updated_at`, registrationID,
	).Scan(&reg.ID, &reg.RegistrationNumber, &reg.UserID, &reg.EventID, &reg.EventCategoryID, &reg.Status,
		&reg.FullName, &reg.Email, &reg.Phone, &reg.DateOfBirth, &reg.Gender,
		&reg.EmergencyContactName, &reg.EmergencyContactPhone, &reg.TshirtSize,
		&reg.CreatedAt, &reg.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("registrations: confirm: %w", err)
	}

	var ticket Ticket
	err = tx.QueryRow(ctx, `
		INSERT INTO tickets (registration_id, token_hash)
		VALUES ($1, $2)
		RETURNING id, registration_id, token_hash, issued_at, created_at, updated_at`,
		reg.ID, ticketTokenHash,
	).Scan(&ticket.ID, &ticket.RegistrationID, &ticket.TokenHash, &ticket.IssuedAt,
		&ticket.CreatedAt, &ticket.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("registrations: insert ticket: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("registrations: commit: %w", err)
	}
	return &CreateResult{Registration: reg, Ticket: &ticket}, nil
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	type pgError interface{ SQLState() string }
	var pgErr pgError
	if errors.As(err, &pgErr) {
		return pgErr.SQLState() == "23505"
	}
	return false
}
