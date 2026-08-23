-- +goose Up
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id     UUID NOT NULL REFERENCES registrations (id) ON DELETE CASCADE,
    provider            TEXT NOT NULL,
    provider_reference  TEXT NOT NULL DEFAULT '',
    amount_cents        INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency            TEXT NOT NULL DEFAULT 'USD',
    status              TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_registration_id ON payments (registration_id);
CREATE INDEX idx_payments_status ON payments (status);

-- +goose Down
DROP TABLE payments;
