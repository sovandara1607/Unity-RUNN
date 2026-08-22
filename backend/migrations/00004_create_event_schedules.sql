-- +goose Up
CREATE TABLE event_schedules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    time         TIME NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_schedules_event_id ON event_schedules (event_id);

-- +goose Down
DROP TABLE event_schedules;
