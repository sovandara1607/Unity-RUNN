-- +goose Up
CREATE TABLE event_categories (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id               UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    name                   TEXT NOT NULL,
    distance               TEXT NOT NULL,
    price_cents            INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    capacity               INTEGER NOT NULL CHECK (capacity >= 0),
    registration_deadline  TIMESTAMPTZ,
    status                 TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'CLOSED', 'SOLD_OUT')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_categories_event_id ON event_categories (event_id);

-- +goose Down
DROP TABLE event_categories;
