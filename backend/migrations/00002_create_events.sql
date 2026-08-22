-- +goose Up
CREATE TABLE events (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   TEXT NOT NULL,
    slug                   TEXT NOT NULL UNIQUE,
    description            TEXT NOT NULL DEFAULT '',
    cover_image            TEXT NOT NULL DEFAULT '',
    event_date             DATE NOT NULL,
    start_time             TIME NOT NULL,
    location               TEXT NOT NULL DEFAULT '',
    latitude               DOUBLE PRECISION,
    longitude              DOUBLE PRECISION,
    registration_open_at   TIMESTAMPTZ,
    registration_close_at  TIMESTAMPTZ,
    status                 TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN (
            'DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED',
            'COMPLETED', 'CANCELLED', 'ARCHIVED'
        )),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_event_date ON events (event_date);
CREATE INDEX idx_events_status ON events (status);

-- +goose Down
DROP TABLE events;
