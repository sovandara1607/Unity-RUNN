-- +goose Up
CREATE TABLE notifications (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES users (id) ON DELETE SET NULL,
    recipient_email  TEXT NOT NULL,
    type             TEXT NOT NULL
        CHECK (type IN (
            'REGISTRATION_CONFIRMATION', 'PAYMENT_CONFIRMATION',
            'EVENT_REMINDER', 'EVENT_UPDATE', 'CANCELLATION'
        )),
    entity_type      TEXT NOT NULL,
    entity_id        UUID NOT NULL,
    payload          JSONB NOT NULL DEFAULT '{}',
    status           TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    attempts         INT NOT NULL DEFAULT 0,
    last_error       TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at          TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_notifications_dedup ON notifications (type, entity_type, entity_id);
CREATE INDEX idx_notifications_status ON notifications (status);
CREATE INDEX idx_notifications_entity ON notifications (entity_type, entity_id);

-- +goose Down
DROP TABLE notifications;
