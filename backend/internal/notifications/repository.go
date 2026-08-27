package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a notification doesn't exist.
var ErrNotFound = errors.New("notifications: not found")

// ErrAlreadyExists is returned when a (type, entity_type, entity_id)

var ErrAlreadyExists = errors.New("notifications: already enqueued for this entity")

// Repository persists notifications in PostgreSQL.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository builds a Repository backed by pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Create inserts a new PENDING notification, populating n.ID/CreatedAt/UpdatedAt.
func (r *Repository) Create(ctx context.Context, n *Notification) error {
	payload := n.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("notifications: encode payload: %w", err)
	}

	const query = `
		INSERT INTO notifications (user_id, recipient_email, type, entity_type, entity_id, payload, status)
		VALUES ($1,$2,$3,$4,$5,$6,'PENDING')
		RETURNING id, created_at, updated_at`

	err = r.pool.QueryRow(ctx, query, n.UserID, n.RecipientEmail, n.Type, n.EntityType, n.EntityID, raw).
		Scan(&n.ID, &n.CreatedAt, &n.UpdatedAt)
	if isUniqueViolation(err) {
		return ErrAlreadyExists
	}
	if err != nil {
		return fmt.Errorf("notifications: create: %w", err)
	}
	n.Payload = payload
	n.Status = StatusPending
	return nil
}

// GetByID fetches a notification by ID.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Notification, error) {
	const query = `
		SELECT id, user_id, recipient_email, type, entity_type, entity_id, payload,
		       status, attempts, last_error, created_at, sent_at, updated_at
		FROM notifications WHERE id = $1`
	n, err := scanNotification(r.pool.QueryRow(ctx, query, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("notifications: get by id: %w", err)
	}
	return n, nil
}

// MarkSent flips a notification to SENT.
func (r *Repository) MarkSent(ctx context.Context, id uuid.UUID, sentAt time.Time) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE notifications SET status = 'SENT', sent_at = $1, updated_at = now() WHERE id = $2`,
		sentAt, id)
	if err != nil {
		return fmt.Errorf("notifications: mark sent: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// RecordFailure increments attempts and records the error. If
// attempts reaches maxAttempts, status flips to FAILED; otherwise it
// stays PENDING so the sweep picks it up again.
func (r *Repository) RecordFailure(ctx context.Context, id uuid.UUID, errMsg string, maxAttempts int) error {
	const query = `
		UPDATE notifications SET
			attempts = attempts + 1,
			last_error = $1,
			status = CASE WHEN attempts + 1 >= $2 THEN 'FAILED' ELSE 'PENDING' END,
			updated_at = now()
		WHERE id = $3`
	tag, err := r.pool.Exec(ctx, query, errMsg, maxAttempts, id)
	if err != nil {
		return fmt.Errorf("notifications: record failure: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) ListPendingOlderThan(ctx context.Context, cutoff time.Time, limit int) ([]Notification, error) {
	const query = `
		SELECT id, user_id, recipient_email, type, entity_type, entity_id, payload,
		       status, attempts, last_error, created_at, sent_at, updated_at
		FROM notifications
		WHERE status = 'PENDING' AND created_at < $1
		ORDER BY created_at ASC
		LIMIT $2`

	rows, err := r.pool.Query(ctx, query, cutoff, limit)
	if err != nil {
		return nil, fmt.Errorf("notifications: list pending: %w", err)
	}
	defer rows.Close()

	var out []Notification
	for rows.Next() {
		n, err := scanNotification(rows)
		if err != nil {
			return nil, fmt.Errorf("notifications: scan: %w", err)
		}
		out = append(out, *n)
	}
	return out, rows.Err()
}

func (r *Repository) ExistsForEntity(ctx context.Context, typ Type, entityType string, entityID uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM notifications WHERE type = $1 AND entity_type = $2 AND entity_id = $3)`,
		typ, entityType, entityID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("notifications: exists for entity: %w", err)
	}
	return exists, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanNotification(row rowScanner) (*Notification, error) {
	var n Notification
	var payloadRaw []byte
	err := row.Scan(&n.ID, &n.UserID, &n.RecipientEmail, &n.Type, &n.EntityType, &n.EntityID,
		&payloadRaw, &n.Status, &n.Attempts, &n.LastError, &n.CreatedAt, &n.SentAt, &n.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(payloadRaw, &n.Payload); err != nil {
		return nil, fmt.Errorf("decode payload: %w", err)
	}
	return &n, nil
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
