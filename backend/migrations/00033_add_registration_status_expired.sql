-- +goose Up
ALTER TABLE registrations DROP CONSTRAINT registrations_status_check;
ALTER TABLE registrations ADD CONSTRAINT registrations_status_check
    CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED', 'EXPIRED'));

-- +goose Down
UPDATE registrations SET status = 'CANCELLED' WHERE status = 'EXPIRED';
ALTER TABLE registrations DROP CONSTRAINT registrations_status_check;
ALTER TABLE registrations ADD CONSTRAINT registrations_status_check
    CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED'));
