-- +goose Up
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'REGISTRATION_CONFIRMATION', 'PAYMENT_CONFIRMATION', 'EVENT_REMINDER',
    'EVENT_UPDATE', 'EVENT_ANNOUNCEMENT', 'CANCELLATION'
));

CREATE TABLE event_automations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    message         TEXT NOT NULL,
    send_at         TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','SCHEDULED','PROCESSING','SENT','FAILED','CANCELLED')),
    sent_count      INT NOT NULL DEFAULT 0,
    attempts        INT NOT NULL DEFAULT 0,
    last_error      TEXT NOT NULL DEFAULT '',
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at       TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_automations_event ON event_automations(event_id, created_at DESC);
CREATE INDEX idx_event_automations_due ON event_automations(status, send_at, next_attempt_at);

-- +goose Down
DROP TABLE event_automations;
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'REGISTRATION_CONFIRMATION', 'PAYMENT_CONFIRMATION',
    'EVENT_REMINDER', 'EVENT_UPDATE', 'CANCELLATION'
));
