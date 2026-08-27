-- +goose Up
ALTER TABLE payments
    ADD COLUMN checkout_payload TEXT NOT NULL DEFAULT '',
    ADD COLUMN expires_at TIMESTAMPTZ,
    ADD COLUMN verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX payments_provider_reference_unique
    ON payments (provider, provider_reference)
    WHERE provider_reference <> '';

-- +goose Down
DROP INDEX IF EXISTS payments_provider_reference_unique;
ALTER TABLE payments
    DROP COLUMN IF EXISTS verified_at,
    DROP COLUMN IF EXISTS expires_at,
    DROP COLUMN IF EXISTS checkout_payload;
