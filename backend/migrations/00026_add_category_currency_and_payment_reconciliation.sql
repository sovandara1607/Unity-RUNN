-- +goose Up
ALTER TABLE event_categories
    ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'
        CHECK (currency IN ('USD', 'KHR'));

ALTER TABLE payments
    ADD CONSTRAINT payments_currency_check CHECK (currency IN ('USD', 'KHR')),
    ADD COLUMN reconcile_after TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN reconcile_lease_until TIMESTAMPTZ,
    ADD COLUMN reconcile_worker_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN last_checked_at TIMESTAMPTZ,
    ADD COLUMN reconcile_attempts INTEGER NOT NULL DEFAULT 0 CHECK (reconcile_attempts >= 0),
    ADD COLUMN reconcile_error TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_payments_pending_reconciliation
    ON payments (reconcile_after, reconcile_lease_until)
    WHERE status = 'PENDING';

CREATE INDEX idx_payments_expiry
    ON payments (expires_at)
    WHERE status = 'PENDING';

-- +goose Down
DROP INDEX IF EXISTS idx_payments_expiry;
DROP INDEX IF EXISTS idx_payments_pending_reconciliation;

ALTER TABLE payments
    DROP COLUMN IF EXISTS reconcile_error,
    DROP COLUMN IF EXISTS reconcile_attempts,
    DROP COLUMN IF EXISTS last_checked_at,
    DROP COLUMN IF EXISTS reconcile_worker_id,
    DROP COLUMN IF EXISTS reconcile_lease_until,
    DROP COLUMN IF EXISTS reconcile_after,
    DROP CONSTRAINT IF EXISTS payments_currency_check;

ALTER TABLE event_categories
    DROP COLUMN IF EXISTS currency;
