-- +goose Up
DROP INDEX idx_registrations_user_event_active;
CREATE UNIQUE INDEX idx_registrations_user_event_active
    ON registrations (user_id, event_id)
    WHERE status IN ('PENDING', 'CONFIRMED');

ALTER TABLE registrations
    DROP CONSTRAINT registrations_event_category_id_fkey,
    ADD CONSTRAINT registrations_event_category_id_fkey
        FOREIGN KEY (event_category_id) REFERENCES event_categories (id) ON DELETE RESTRICT;

-- +goose Down
ALTER TABLE registrations
    DROP CONSTRAINT registrations_event_category_id_fkey,
    ADD CONSTRAINT registrations_event_category_id_fkey
        FOREIGN KEY (event_category_id) REFERENCES event_categories (id) ON DELETE CASCADE;

DROP INDEX idx_registrations_user_event_active;
CREATE UNIQUE INDEX idx_registrations_user_event_active
    ON registrations (user_id, event_id)
    WHERE status != 'CANCELLED';
