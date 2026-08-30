-- +goose Up
CREATE TABLE notification_deliveries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id  UUID NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    channel           TEXT NOT NULL CHECK (channel IN ('TELEGRAM')),
    status            TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'SKIPPED', 'FAILED')),
    attempts          INT NOT NULL DEFAULT 0,
    last_error        TEXT NOT NULL DEFAULT '',
    locked_at         TIMESTAMPTZ,
    next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at           TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (notification_id, channel)
);

CREATE INDEX idx_notification_deliveries_work
    ON notification_deliveries (status, next_attempt_at, created_at)
    WHERE status IN ('PENDING', 'PROCESSING');
CREATE INDEX idx_notification_deliveries_user
    ON notification_deliveries (user_id, created_at DESC);

-- +goose Down
DROP TABLE notification_deliveries;
