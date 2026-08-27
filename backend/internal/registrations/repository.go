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
			WHERE user_id = $1 AND event_id = $2 AND status IN ('PENDING', 'CONFIRMED')
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

// GetRegistrationIDByTicketTokenHash finds the registration a ticket
// belongs to, by the SHA-256 hash of its raw QR token (see
// internal/tokenhash — never the raw token). Used by
// internal/checkin to resolve a scanned token to a registration
// without checkin needing to know about the tickets table's schema.
func (r *Repository) GetRegistrationIDByTicketTokenHash(ctx context.Context, tokenHash string) (uuid.UUID, error) {
	var registrationID uuid.UUID
	err := r.pool.QueryRow(ctx,
		`SELECT registration_id FROM tickets WHERE token_hash = $1`, tokenHash).Scan(&registrationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("registrations: get registration by ticket token: %w", err)
	}
	return registrationID, nil
}

// GetByRegistrationNumber fetches a registration by its
// URC-YYYY-NNNNNN number. Used by check-in as a fallback when a scan
// or manual entry doesn't resolve to a ticket token.
func (r *Repository) GetByRegistrationNumber(ctx context.Context, number string) (*Registration, error) {
	const query = `
		SELECT id, registration_number, user_id, event_id, event_category_id, status,
		       full_name, email, phone, date_of_birth, gender,
		       emergency_contact_name, emergency_contact_phone, tshirt_size,
		       created_at, updated_at
		FROM registrations WHERE registration_number = $1`

	var reg Registration
	err := r.pool.QueryRow(ctx, query, number).Scan(&reg.ID, &reg.RegistrationNumber, &reg.UserID,
		&reg.EventID, &reg.EventCategoryID, &reg.Status, &reg.FullName, &reg.Email, &reg.Phone,
		&reg.DateOfBirth, &reg.Gender, &reg.EmergencyContactName, &reg.EmergencyContactPhone,
		&reg.TshirtSize, &reg.CreatedAt, &reg.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("registrations: get by registration number: %w", err)
	}
	return &reg, nil
}

// RotateTicketToken replaces the stored token hash for a
// registration's ticket. Raw tokens are never persisted, so issuing
// a token to display again always rotates the hash — previous QRs
// stop scanning.
func (r *Repository) RotateTicketToken(ctx context.Context, registrationID uuid.UUID, tokenHash string) error {
	ct, err := r.pool.Exec(ctx,
		`UPDATE tickets SET token_hash = $2, updated_at = now() WHERE registration_id = $1`,
		registrationID, tokenHash)
	if err != nil {
		return fmt.Errorf("registrations: rotate ticket token: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) HasCheckIn(ctx context.Context, registrationID uuid.UUID) (bool, error) {
	var exists bool
	if err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM check_ins WHERE registration_id = $1)`, registrationID).Scan(&exists); err != nil {
		return false, fmt.Errorf("registrations: check check-in status: %w", err)
	}
	return exists, nil
}

// ListFilter narrows an admin ListAll query.
type AdminListFilter struct {
	EventID *uuid.UUID
	Status  *Status
	Limit   int
	Offset  int
}

// ListAll returns registrations across all users (STAFF+ only,
// enforced by the caller), optionally filtered by event/status, most
// recent first, plus the total matching count for pagination.
func (r *Repository) ListAll(ctx context.Context, filter AdminListFilter) ([]Registration, int, error) {
	where := "WHERE 1=1"
	args := []any{}
	argN := 1

	if filter.EventID != nil {
		where += fmt.Sprintf(" AND r.event_id = $%d", argN)
		args = append(args, *filter.EventID)
		argN++
	}
	if filter.Status != nil {
		where += fmt.Sprintf(" AND r.status = $%d", argN)
		args = append(args, *filter.Status)
		argN++
	}

	var total int
	countQuery := "SELECT count(*) FROM registrations r " + where
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("registrations: admin count: %w", err)
	}

	limit, offset := filter.Limit, filter.Offset
	args = append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT r.id, r.registration_number, r.user_id, r.event_id, r.event_category_id, r.status,
		       r.full_name, r.email, r.phone, r.date_of_birth, r.gender,
		       r.emergency_contact_name, r.emergency_contact_phone, r.tshirt_size,
		       r.created_at, r.updated_at, ci.checked_in_at
		FROM registrations r
		LEFT JOIN check_ins ci ON ci.registration_id = r.id
		%s ORDER BY r.created_at DESC LIMIT $%d OFFSET $%d`, where, argN, argN+1)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("registrations: admin list: %w", err)
	}
	defer rows.Close()

	var out []Registration
	for rows.Next() {
		var reg Registration
		if err := rows.Scan(&reg.ID, &reg.RegistrationNumber, &reg.UserID, &reg.EventID,
			&reg.EventCategoryID, &reg.Status, &reg.FullName, &reg.Email, &reg.Phone,
			&reg.DateOfBirth, &reg.Gender, &reg.EmergencyContactName, &reg.EmergencyContactPhone,
			&reg.TshirtSize, &reg.CreatedAt, &reg.UpdatedAt, &reg.CheckedInAt); err != nil {
			return nil, 0, fmt.Errorf("registrations: admin scan: %w", err)
		}
		out = append(out, reg)
	}
	return out, total, rows.Err()
}

// ListForUser returns all registrations belonging to userID, most
// recent first.
func (r *Repository) ListForUser(ctx context.Context, userID uuid.UUID) ([]Registration, error) {
	const query = `
		SELECT r.id, r.registration_number, r.user_id, r.event_id, r.event_category_id, r.status,
		       r.full_name, r.email, r.phone, r.date_of_birth, r.gender,
		       r.emergency_contact_name, r.emergency_contact_phone, r.tshirt_size,
		       r.created_at, r.updated_at, ci.checked_in_at
		FROM registrations r
		LEFT JOIN check_ins ci ON ci.registration_id = r.id
		WHERE r.user_id = $1 ORDER BY r.created_at DESC`

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
			&reg.TshirtSize, &reg.CreatedAt, &reg.UpdatedAt, &reg.CheckedInAt); err != nil {
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
		INSERT INTO payments (registration_id, provider, provider_reference, amount_cents, currency, status, checkout_payload, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, created_at, updated_at`
	return r.pool.QueryRow(ctx, query, p.RegistrationID, p.Provider, p.ProviderReference,
		p.AmountCents, p.Currency, p.Status, p.CheckoutPayload, p.ExpiresAt).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
}

func (r *Repository) GetPaymentForRegistration(ctx context.Context, registrationID uuid.UUID) (*Payment, error) {
	var p Payment
	err := r.pool.QueryRow(ctx, `
		SELECT id, registration_id, provider, provider_reference, amount_cents, currency, status,
		       checkout_payload, expires_at, verified_at, created_at, updated_at
		FROM payments WHERE registration_id = $1 ORDER BY created_at DESC LIMIT 1`, registrationID,
	).Scan(&p.ID, &p.RegistrationID, &p.Provider, &p.ProviderReference, &p.AmountCents, &p.Currency,
		&p.Status, &p.CheckoutPayload, &p.ExpiresAt, &p.VerifiedAt, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("registrations: get payment: %w", err)
	}
	return &p, nil
}

// ExpirePendingPayments releases capacity held by abandoned KHQR checkouts.
// Payment and registration rows transition in one transaction.
func (r *Repository) ExpirePendingPayments(ctx context.Context, now time.Time) ([]uuid.UUID, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("registrations: begin payment expiry: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	rows, err := tx.Query(ctx, `
		UPDATE registrations r SET status='CANCELLED', updated_at=now()
		WHERE r.status='PENDING' AND EXISTS (
			SELECT 1 FROM payments p WHERE p.registration_id=r.id
			AND p.status='PENDING' AND p.expires_at IS NOT NULL AND p.expires_at <= $1
		) RETURNING r.event_category_id`, now)
	if err != nil {
		return nil, fmt.Errorf("registrations: expire registrations: %w", err)
	}
	var categoryIDs []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		categoryIDs = append(categoryIDs, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	if _, err := tx.Exec(ctx, `UPDATE payments SET status='FAILED', updated_at=now() WHERE status='PENDING' AND expires_at IS NOT NULL AND expires_at <= $1`, now); err != nil {
		return nil, fmt.Errorf("registrations: expire payments: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("registrations: commit payment expiry: %w", err)
	}
	return categoryIDs, nil
}

// ConfirmStoredPayment is idempotent: concurrent verification polls can only
// transition one pending row and the ticket insert is protected by its unique
// registration relationship.
func (r *Repository) ConfirmStoredPayment(ctx context.Context, registrationID, paymentID uuid.UUID, ticketTokenHash string) (*Registration, bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("registrations: begin payment confirmation: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var reg Registration
	err = tx.QueryRow(ctx, `
		SELECT id, registration_number, user_id, event_id, event_category_id, status,
		       full_name, email, phone, date_of_birth, gender, emergency_contact_name,
		       emergency_contact_phone, tshirt_size, created_at, updated_at
		FROM registrations WHERE id = $1 FOR UPDATE`, registrationID,
	).Scan(&reg.ID, &reg.RegistrationNumber, &reg.UserID, &reg.EventID, &reg.EventCategoryID, &reg.Status,
		&reg.FullName, &reg.Email, &reg.Phone, &reg.DateOfBirth, &reg.Gender,
		&reg.EmergencyContactName, &reg.EmergencyContactPhone, &reg.TshirtSize, &reg.CreatedAt, &reg.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, ErrNotFound
	}
	if err != nil {
		return nil, false, fmt.Errorf("registrations: lock payment registration: %w", err)
	}

	if _, err = tx.Exec(ctx, `UPDATE payments SET status='SUCCEEDED', verified_at=COALESCE(verified_at, now()), updated_at=now() WHERE id=$1 AND registration_id=$2`, paymentID, registrationID); err != nil {
		return nil, false, fmt.Errorf("registrations: mark payment succeeded: %w", err)
	}
	newlyConfirmed := reg.Status == StatusPending
	if reg.Status == StatusPending {
		err = tx.QueryRow(ctx, `UPDATE registrations SET status='CONFIRMED', updated_at=now() WHERE id=$1 RETURNING status, updated_at`, registrationID).Scan(&reg.Status, &reg.UpdatedAt)
		if err != nil {
			return nil, false, fmt.Errorf("registrations: confirm paid registration: %w", err)
		}
		_, err = tx.Exec(ctx, `INSERT INTO tickets (registration_id, token_hash) VALUES ($1,$2) ON CONFLICT (registration_id) DO NOTHING`, registrationID, ticketTokenHash)
		if err != nil {
			return nil, false, fmt.Errorf("registrations: issue paid ticket: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, fmt.Errorf("registrations: commit payment confirmation: %w", err)
	}
	return &reg, newlyConfirmed, nil
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
