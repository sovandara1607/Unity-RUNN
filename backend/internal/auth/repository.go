package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a user, profile, or refresh token
// doesn't exist.
var ErrNotFound = errors.New("auth: not found")

// ErrEmailTaken is returned when creating a user whose email already
// exists.
var ErrEmailTaken = errors.New("auth: email already registered")

// Repository persists users, profiles, and refresh tokens in
// PostgreSQL. No business rules live here — only SQL.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository builds a Repository backed by pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// CreateUserWithProfile inserts a user and its profile in a single
// transaction, populating both structs' generated fields.
func (r *Repository) CreateUserWithProfile(ctx context.Context, u *User, p *Profile) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("auth: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, role)
		VALUES ($1, $2, $3)
		RETURNING id, created_at, updated_at`,
		u.Email, u.PasswordHash, u.Role,
	).Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt)
	if isUniqueViolation(err) {
		return ErrEmailTaken
	}
	if err != nil {
		return fmt.Errorf("auth: create user: %w", err)
	}

	p.UserID = u.ID
	err = tx.QueryRow(ctx, `
		INSERT INTO profiles (user_id, full_name, phone, date_of_birth, gender,
		                       emergency_contact_name, emergency_contact_phone,
		                       tshirt_size, avatar_url)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, created_at, updated_at`,
		p.UserID, p.FullName, p.Phone, p.DateOfBirth, p.Gender,
		p.EmergencyContactName, p.EmergencyContactPhone, p.TshirtSize, p.AvatarURL,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return fmt.Errorf("auth: create profile: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("auth: commit: %w", err)
	}
	return nil
}

// GetUserByEmail fetches a user by email.
func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	const query = `SELECT id, email, password_hash, role, created_at, updated_at
		FROM users WHERE email = $1`
	return scanUserRow(r.pool.QueryRow(ctx, query, email))
}

// GetUserByID fetches a user by ID.
func (r *Repository) GetUserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	const query = `SELECT id, email, password_hash, role, created_at, updated_at
		FROM users WHERE id = $1`
	return scanUserRow(r.pool.QueryRow(ctx, query, id))
}

func scanUserRow(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: scan user: %w", err)
	}
	return &u, nil
}

// GetProfileByUserID fetches a profile by owning user ID.
func (r *Repository) GetProfileByUserID(ctx context.Context, userID uuid.UUID) (*Profile, error) {
	const query = `
		SELECT id, user_id, full_name, phone, date_of_birth, gender,
		       emergency_contact_name, emergency_contact_phone, tshirt_size,
		       avatar_url, created_at, updated_at
		FROM profiles WHERE user_id = $1`

	var p Profile
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&p.ID, &p.UserID, &p.FullName, &p.Phone, &p.DateOfBirth, &p.Gender,
		&p.EmergencyContactName, &p.EmergencyContactPhone, &p.TshirtSize,
		&p.AvatarURL, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: get profile: %w", err)
	}
	return &p, nil
}

// UpdateProfile overwrites all mutable columns of the profile
// identified by p.ID, refreshing UpdatedAt.
func (r *Repository) UpdateProfile(ctx context.Context, p *Profile) error {
	const query = `
		UPDATE profiles SET
			full_name = $1, phone = $2, date_of_birth = $3, gender = $4,
			emergency_contact_name = $5, emergency_contact_phone = $6,
			tshirt_size = $7, avatar_url = $8, updated_at = now()
		WHERE id = $9
		RETURNING updated_at`

	err := r.pool.QueryRow(ctx, query,
		p.FullName, p.Phone, p.DateOfBirth, p.Gender, p.EmergencyContactName,
		p.EmergencyContactPhone, p.TshirtSize, p.AvatarURL, p.ID,
	).Scan(&p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("auth: update profile: %w", err)
	}
	return nil
}

// CreateRefreshToken inserts a new refresh token record.
func (r *Repository) CreateRefreshToken(ctx context.Context, t *RefreshToken) error {
	const query = `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, created_at`

	return r.pool.QueryRow(ctx, query, t.UserID, t.TokenHash, t.ExpiresAt).
		Scan(&t.ID, &t.CreatedAt)
}

// GetRefreshTokenByHash fetches a refresh token by its hash.
func (r *Repository) GetRefreshTokenByHash(ctx context.Context, hash string) (*RefreshToken, error) {
	const query = `
		SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
		FROM refresh_tokens WHERE token_hash = $1`

	var t RefreshToken
	err := r.pool.QueryRow(ctx, query, hash).Scan(
		&t.ID, &t.UserID, &t.TokenHash, &t.ExpiresAt, &t.RevokedAt, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: get refresh token: %w", err)
	}
	return &t, nil
}

// RevokeRefreshToken marks a refresh token revoked as of now.
func (r *Repository) RevokeRefreshToken(ctx context.Context, id uuid.UUID, now time.Time) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL`,
		now, id)
	if err != nil {
		return fmt.Errorf("auth: revoke refresh token: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// isUniqueViolation reports whether err is a Postgres unique
// constraint violation (SQLSTATE 23505), without importing pgconn
// directly into every caller.
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
