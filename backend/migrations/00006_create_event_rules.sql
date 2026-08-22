-- +goose Up
CREATE TABLE event_rules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    rule         TEXT NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_rules_event_id ON event_rules (event_id);

-- +goose Down
DROP TABLE event_rules;
