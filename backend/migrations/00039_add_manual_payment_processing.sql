-- +goose Up
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
    CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED'));

-- +goose Down
UPDATE payments SET status = 'PENDING' WHERE status = 'PROCESSING';
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
    CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'));
