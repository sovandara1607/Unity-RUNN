package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a notification doesn't exist.
var ErrNotFound = errors.New("notifications: not found")

// ErrAlreadyExists is returned when a (type, entity_type, entity_id)

var ErrAlreadyExists = errors.New("notifications: already enqueued for this entity")
var ErrDeliveryNotRetryable = errors.New("notifications: delivery is not failed")

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

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("notifications: begin create: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	const query = `
		INSERT INTO notifications (user_id, recipient_email, type, entity_type, entity_id, payload, status)
		VALUES ($1,$2,$3,$4,$5,$6,'PENDING')
		RETURNING id, created_at, updated_at`

	err = tx.QueryRow(ctx, query, n.UserID, n.RecipientEmail, n.Type, n.EntityType, n.EntityID, raw).
		Scan(&n.ID, &n.CreatedAt, &n.UpdatedAt)
	if isUniqueViolation(err) {
		return ErrAlreadyExists
	}
	if err != nil {
		return fmt.Errorf("notifications: create: %w", err)
	}
	if n.UserID != nil {
		if _, err := tx.Exec(ctx, `INSERT INTO notification_deliveries (notification_id, user_id, channel) VALUES ($1,$2,'TELEGRAM')`, n.ID, *n.UserID); err != nil {
			return fmt.Errorf("notifications: create Telegram delivery: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("notifications: commit create: %w", err)
	}
	n.Payload = payload
	n.Status = StatusPending
	return nil
}

// ClaimTelegramDeliveries leases pending work so multiple API instances do not send the same message concurrently.
func (r *Repository) ClaimTelegramDeliveries(ctx context.Context, limit int) ([]Delivery, error) {
	const query = `
		WITH claimed AS (
			SELECT id FROM notification_deliveries
			WHERE channel='TELEGRAM' AND (
				(status='PENDING' AND next_attempt_at <= now()) OR
				(status='PROCESSING' AND locked_at < now() - interval '2 minutes')
			)
			ORDER BY created_at ASC
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE notification_deliveries AS delivery
		SET status='PROCESSING', locked_at=now(), updated_at=now()
		FROM claimed
		WHERE delivery.id=claimed.id
		RETURNING delivery.id, delivery.notification_id, delivery.user_id, delivery.channel,
		          delivery.status, delivery.attempts, delivery.last_error, delivery.created_at,
		          delivery.sent_at, delivery.updated_at`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("notifications: claim Telegram deliveries: %w", err)
	}
	defer rows.Close()
	var deliveries []Delivery
	for rows.Next() {
		var delivery Delivery
		if err := rows.Scan(&delivery.ID, &delivery.NotificationID, &delivery.UserID, &delivery.Channel,
			&delivery.Status, &delivery.Attempts, &delivery.LastError, &delivery.CreatedAt, &delivery.SentAt, &delivery.UpdatedAt); err != nil {
			return nil, fmt.Errorf("notifications: scan claimed delivery: %w", err)
		}
		deliveries = append(deliveries, delivery)
	}
	return deliveries, rows.Err()
}

func (r *Repository) MarkDeliverySent(ctx context.Context, id uuid.UUID, sentAt time.Time) error {
	return r.updateDeliveryStatus(ctx, id, DeliverySent, "", sentAt)
}

func (r *Repository) MarkDeliverySkipped(ctx context.Context, id uuid.UUID) error {
	return r.updateDeliveryStatus(ctx, id, DeliverySkipped, "", time.Time{})
}

func (r *Repository) RecordDeliveryFailure(ctx context.Context, id uuid.UUID, errMsg string, maxAttempts int) error {
	const query = `UPDATE notification_deliveries SET attempts=attempts+1, last_error=$2, locked_at=NULL,
		status=CASE WHEN attempts+1 >= $3 THEN 'FAILED' ELSE 'PENDING' END,
		next_attempt_at=now() + (LEAST(POWER(2, attempts), 60)::int * interval '1 minute'), updated_at=now()
		WHERE id=$1`
	tag, err := r.pool.Exec(ctx, query, id, errMsg, maxAttempts)
	if err != nil {
		return fmt.Errorf("notifications: record delivery failure: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) updateDeliveryStatus(ctx context.Context, id uuid.UUID, status DeliveryStatus, errMsg string, sentAt time.Time) error {
	var sent any
	if !sentAt.IsZero() {
		sent = sentAt
	}
	tag, err := r.pool.Exec(ctx, `UPDATE notification_deliveries SET status=$2, last_error=$3, locked_at=NULL,
		sent_at=$4, updated_at=now() WHERE id=$1`, id, status, errMsg, sent)
	if err != nil {
		return fmt.Errorf("notifications: update delivery status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) ListUserTelegramDeliveries(ctx context.Context, userID uuid.UUID, limit int) ([]Delivery, error) {
	const query = `SELECT delivery.id, delivery.notification_id, delivery.user_id, delivery.channel,
		delivery.status, notification.type, notification.entity_id, delivery.attempts,
		delivery.created_at, delivery.sent_at, delivery.updated_at
		FROM notification_deliveries AS delivery
		JOIN notifications AS notification ON notification.id=delivery.notification_id
		WHERE delivery.user_id=$1 AND delivery.channel='TELEGRAM' AND delivery.status <> 'SKIPPED'
		ORDER BY delivery.created_at DESC LIMIT $2`
	rows, err := r.pool.Query(ctx, query, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("notifications: list user Telegram deliveries: %w", err)
	}
	defer rows.Close()
	var deliveries []Delivery
	for rows.Next() {
		var delivery Delivery
		if err := rows.Scan(&delivery.ID, &delivery.NotificationID, &delivery.UserID, &delivery.Channel,
			&delivery.Status, &delivery.Type, &delivery.EntityID, &delivery.Attempts,
			&delivery.CreatedAt, &delivery.SentAt, &delivery.UpdatedAt); err != nil {
			return nil, fmt.Errorf("notifications: scan user delivery: %w", err)
		}
		deliveries = append(deliveries, delivery)
	}
	return deliveries, rows.Err()
}

func (r *Repository) AutomationSnapshot(ctx context.Context, configured bool, windowDays, recentLimit int) (*AutomationSnapshot, error) {
	if windowDays <= 0 {
		windowDays = 30
	}
	if recentLimit <= 0 || recentLimit > 100 {
		recentLimit = 40
	}
	snapshot := &AutomationSnapshot{Configured: configured, GeneratedAt: time.Now(), WindowDays: windowDays, ByType: map[Type]int{}}

	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*),
		COUNT(*) FILTER (WHERE tickets_enabled), COUNT(*) FILTER (WHERE reminders_enabled),
		COUNT(*) FILTER (WHERE event_updates_enabled) FROM telegram_connections`).Scan(
		&snapshot.ConnectedRunners, &snapshot.Preferences.Tickets, &snapshot.Preferences.Reminders, &snapshot.Preferences.EventUpdates); err != nil {
		return nil, fmt.Errorf("notifications: automation connection summary: %w", err)
	}

	interval := fmt.Sprintf("%d days", windowDays)
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*),
		COUNT(*) FILTER (WHERE status='SENT'),
		COUNT(*) FILTER (WHERE status IN ('PENDING','PROCESSING')),
		COUNT(*) FILTER (WHERE status='FAILED'),
		COUNT(*) FILTER (WHERE status='SKIPPED')
		FROM notification_deliveries WHERE channel='TELEGRAM' AND created_at >= now() - $1::interval`, interval).Scan(
		&snapshot.Counts.Total, &snapshot.Counts.Sent, &snapshot.Counts.Pending, &snapshot.Counts.Failed, &snapshot.Counts.Skipped); err != nil {
		return nil, fmt.Errorf("notifications: automation delivery summary: %w", err)
	}
	completed := snapshot.Counts.Sent + snapshot.Counts.Failed
	if completed > 0 {
		snapshot.SuccessRate = float64(snapshot.Counts.Sent) / float64(completed)
	}

	rows, err := r.pool.Query(ctx, `SELECT notification.type, COUNT(*) FROM notification_deliveries AS delivery
		JOIN notifications AS notification ON notification.id=delivery.notification_id
		WHERE delivery.channel='TELEGRAM' AND delivery.created_at >= now() - $1::interval
		GROUP BY notification.type`, interval)
	if err != nil {
		return nil, fmt.Errorf("notifications: automation type summary: %w", err)
	}
	for rows.Next() {
		var typ Type
		var count int
		if err := rows.Scan(&typ, &count); err != nil {
			rows.Close()
			return nil, fmt.Errorf("notifications: scan automation type: %w", err)
		}
		snapshot.ByType[typ] = count
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	recent, err := r.listAdminTelegramDeliveries(ctx, recentLimit)
	if err != nil {
		return nil, err
	}
	snapshot.Recent = recent
	return snapshot, nil
}

func (r *Repository) listAdminTelegramDeliveries(ctx context.Context, limit int) ([]AdminDelivery, error) {
	const query = `SELECT delivery.id, delivery.status, notification.type, notification.entity_id,
		COALESCE(NULLIF(profile.full_name,''), users.email), users.email, delivery.attempts,
		delivery.last_error, delivery.created_at, delivery.sent_at, delivery.updated_at
		FROM notification_deliveries AS delivery
		JOIN notifications AS notification ON notification.id=delivery.notification_id
		JOIN users ON users.id=delivery.user_id
		LEFT JOIN profiles AS profile ON profile.user_id=users.id
		WHERE delivery.channel='TELEGRAM'
		ORDER BY delivery.created_at DESC LIMIT $1`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("notifications: list admin Telegram deliveries: %w", err)
	}
	defer rows.Close()
	deliveries := make([]AdminDelivery, 0)
	for rows.Next() {
		var delivery AdminDelivery
		var rawError string
		if err := rows.Scan(&delivery.ID, &delivery.Status, &delivery.Type, &delivery.EntityID,
			&delivery.RunnerName, &delivery.RecipientEmail, &delivery.Attempts, &rawError,
			&delivery.CreatedAt, &delivery.SentAt, &delivery.UpdatedAt); err != nil {
			return nil, fmt.Errorf("notifications: scan admin delivery: %w", err)
		}
		delivery.FailureReason = safeFailureReason(rawError)
		deliveries = append(deliveries, delivery)
	}
	return deliveries, rows.Err()
}

func safeFailureReason(raw string) string {
	if raw == "" {
		return ""
	}
	value := strings.ToLower(raw)
	switch {
	case strings.Contains(value, "request failed"):
		return "Telegram could not be reached"
	case strings.Contains(value, "returned 4"):
		return "Telegram rejected the recipient or message"
	case strings.Contains(value, "returned 5"):
		return "Telegram is temporarily unavailable"
	case strings.Contains(value, "build telegram data"), strings.Contains(value, "load notification"):
		return "Race message data could not be prepared"
	default:
		return "Delivery failed after provider attempts"
	}
}

func (r *Repository) RetryTelegramDelivery(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `UPDATE notification_deliveries SET status='PENDING', attempts=0,
		last_error='', locked_at=NULL, next_attempt_at=now(), sent_at=NULL, updated_at=now()
		WHERE id=$1 AND channel='TELEGRAM' AND status='FAILED'`, id)
	if err != nil {
		return fmt.Errorf("notifications: retry Telegram delivery: %w", err)
	}
	if tag.RowsAffected() > 0 {
		return nil
	}
	var status DeliveryStatus
	if err := r.pool.QueryRow(ctx, `SELECT status FROM notification_deliveries WHERE id=$1 AND channel='TELEGRAM'`, id).Scan(&status); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return fmt.Errorf("notifications: load delivery for retry: %w", err)
	}
	return ErrDeliveryNotRetryable
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
