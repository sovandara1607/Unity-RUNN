-- +goose Up
CREATE TABLE tickets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id   UUID NOT NULL UNIQUE REFERENCES registrations (id) ON DELETE CASCADE,
    token_hash        TEXT NOT NULL UNIQUE,
    issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_token_hash ON tickets (token_hash);

-- +goose Down
DROP TABLE tickets;
