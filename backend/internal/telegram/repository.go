package telegram

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("telegram: not found")
var ErrAlreadyLinked = errors.New("telegram: account already linked")
var ErrTestRateLimited = errors.New("telegram: test message rate limited")

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) GetConnection(ctx context.Context, userID uuid.UUID) (*Connection, error) {
	const query = `SELECT user_id, chat_id, telegram_user_id, username, first_name, linked_at,
		tickets_enabled, reminders_enabled, event_updates_enabled FROM telegram_connections WHERE user_id = $1`
	var c Connection
	if err := r.pool.QueryRow(ctx, query, userID).Scan(&c.UserID, &c.ChatID, &c.TelegramUserID, &c.Username, &c.FirstName, &c.LinkedAt,
		&c.Preferences.Tickets, &c.Preferences.Reminders, &c.Preferences.EventUpdates); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("telegram: get connection: %w", err)
	}
	return &c, nil
}

func (r *Repository) UpdatePreferences(ctx context.Context, userID uuid.UUID, p Preferences) error {
	tag, err := r.pool.Exec(ctx, `UPDATE telegram_connections SET tickets_enabled=$2, reminders_enabled=$3,
		event_updates_enabled=$4, updated_at=now() WHERE user_id=$1`, userID, p.Tickets, p.Reminders, p.EventUpdates)
	if err != nil {
		return fmt.Errorf("telegram: update preferences: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) ReserveTestMessage(ctx context.Context, userID uuid.UUID, now time.Time) (*Connection, error) {
	const query = `
		UPDATE telegram_connections SET last_test_sent_at=$2, updated_at=now()
		WHERE user_id=$1 AND (last_test_sent_at IS NULL OR last_test_sent_at < $2 - interval '30 seconds')
		RETURNING user_id, chat_id, telegram_user_id, username, first_name, linked_at,
		          tickets_enabled, reminders_enabled, event_updates_enabled`
	var c Connection
	err := r.pool.QueryRow(ctx, query, userID, now).Scan(&c.UserID, &c.ChatID, &c.TelegramUserID, &c.Username, &c.FirstName, &c.LinkedAt,
		&c.Preferences.Tickets, &c.Preferences.Reminders, &c.Preferences.EventUpdates)
	if errors.Is(err, pgx.ErrNoRows) {
		if _, getErr := r.GetConnection(ctx, userID); errors.Is(getErr, ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, ErrTestRateLimited
	}
	if err != nil {
		return nil, fmt.Errorf("telegram: reserve test message: %w", err)
	}
	return &c, nil
}

func (r *Repository) SaveLinkToken(ctx context.Context, userID uuid.UUID, hash []byte, expiresAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO telegram_link_tokens (token_hash, user_id, expires_at) VALUES ($1,$2,$3)
		ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, created_at = now()`, hash, userID, expiresAt)
	if err != nil {
		return fmt.Errorf("telegram: save link token: %w", err)
	}
	return nil
}

func (r *Repository) ConsumeLinkToken(ctx context.Context, hash []byte, chatID, telegramUserID int64, username, firstName string) (uuid.UUID, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("telegram: begin link: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var userID uuid.UUID
	if err := tx.QueryRow(ctx, `DELETE FROM telegram_link_tokens WHERE token_hash = $1 AND expires_at > now() RETURNING user_id`, hash).Scan(&userID); errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	} else if err != nil {
		return uuid.Nil, fmt.Errorf("telegram: consume link token: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO telegram_connections (user_id, chat_id, telegram_user_id, username, first_name)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (user_id) DO UPDATE SET chat_id = EXCLUDED.chat_id, telegram_user_id = EXCLUDED.telegram_user_id,
		username = EXCLUDED.username, first_name = EXCLUDED.first_name, linked_at = now(), updated_at = now()`,
		userID, chatID, telegramUserID, username, firstName)
	if err != nil {
		if pgErr, ok := err.(interface{ SQLState() string }); ok && pgErr.SQLState() == "23505" {
			return uuid.Nil, ErrAlreadyLinked
		}
		return uuid.Nil, fmt.Errorf("telegram: connect account: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("telegram: commit link: %w", err)
	}
	return userID, nil
}

func (r *Repository) DeleteConnection(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM telegram_connections WHERE user_id = $1`, userID)
	if err != nil {
		return fmt.Errorf("telegram: delete connection: %w", err)
	}
	return nil
}
