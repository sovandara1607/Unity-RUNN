-- +goose Up
ALTER TABLE telegram_connections
    ADD COLUMN tickets_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN reminders_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN event_updates_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN last_test_sent_at     TIMESTAMPTZ;

-- +goose Down
ALTER TABLE telegram_connections
    DROP COLUMN last_test_sent_at,
    DROP COLUMN event_updates_enabled,
    DROP COLUMN reminders_enabled,
    DROP COLUMN tickets_enabled;
