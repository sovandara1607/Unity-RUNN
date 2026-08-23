-- +goose Up
CREATE TABLE registrations (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_number      TEXT NOT NULL UNIQUE,
    user_id                  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_id                 UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    event_category_id        UUID NOT NULL REFERENCES event_categories (id) ON DELETE CASCADE,
    status                   TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED')),
    full_name                TEXT NOT NULL,
    email                    TEXT NOT NULL,
    phone                    TEXT NOT NULL DEFAULT '',
    date_of_birth            DATE,
    gender                   TEXT NOT NULL DEFAULT '',
    emergency_contact_name   TEXT NOT NULL DEFAULT '',
    emergency_contact_phone  TEXT NOT NULL DEFAULT '',
    tshirt_size              TEXT NOT NULL DEFAULT '',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_registrations_event_id ON registrations (event_id);
CREATE INDEX idx_registrations_status ON registrations (status);
CREATE INDEX idx_registrations_user_id ON registrations (user_id);

-- One active (non-cancelled) registration per user per event.
CREATE UNIQUE INDEX idx_registrations_user_event_active
    ON registrations (user_id, event_id)
    WHERE status != 'CANCELLED';

-- +goose Down
DROP TABLE registrations;
