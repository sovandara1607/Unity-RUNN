-- +goose Up
CREATE TABLE event_faqs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    question     TEXT NOT NULL,
    answer       TEXT NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_faqs_event_id ON event_faqs (event_id);

-- +goose Down
DROP TABLE event_faqs;
