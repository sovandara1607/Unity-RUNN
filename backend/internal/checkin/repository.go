package checkin

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a check-in doesn't exist
var ErrNotFound = errors.New("checkin: not found")

// ErrAlreadyCheckedIn is returned when a registration already has a check-in record — the unique constraint on check_ins.registration_id is the authoritative guarantee; this error surfaces that violation
var ErrAlreadyCheckedIn = errors.New("checkin: registration already checked in")

// Repository persists check-in records in PostgreSQL
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository builds a Repository backed by pool
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Create records a check-in. The unique constraint on registration_id is what actually prevents double check-in under concurrency — this method surfaces that as ErrAlreadyCheckedIn rather than a raw constraint-violation error
func (r *Repository) Create(ctx context.Context, registrationID, staffUserID uuid.UUID) (*CheckIn, error) {
	const query = `
		INSERT INTO check_ins (registration_id, staff_user_id)
		VALUES ($1, $2)
		RETURNING id, registration_id, staff_user_id, checked_in_at, created_at`

	var c CheckIn
	err := r.pool.QueryRow(ctx, query, registrationID, staffUserID).
		Scan(&c.ID, &c.RegistrationID, &c.StaffUserID, &c.CheckedInAt, &c.CreatedAt)
	if isUniqueViolation(err) {
		return nil, ErrAlreadyCheckedIn
	}
	if err != nil {
		return nil, fmt.Errorf("checkin: create: %w", err)
	}
	return &c, nil
}

// GetByRegistrationID fetches the check-in for a registration, if any
func (r *Repository) GetByRegistrationID(ctx context.Context, registrationID uuid.UUID) (*CheckIn, error) {
	const query = `
		SELECT id, registration_id, staff_user_id, checked_in_at, created_at
		FROM check_ins WHERE registration_id = $1`

	var c CheckIn
	err := r.pool.QueryRow(ctx, query, registrationID).
		Scan(&c.ID, &c.RegistrationID, &c.StaffUserID, &c.CheckedInAt, &c.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("checkin: get by registration id: %w", err)
	}
	return &c, nil
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
