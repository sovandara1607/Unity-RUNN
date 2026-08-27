-- +goose Up
-- A refunded registration no longer occupies capacity and must not block the
-- runner from entering the event again.
DROP INDEX idx_registrations_user_event_active;
CREATE UNIQUE INDEX idx_registrations_user_event_active
    ON registrations (user_id, event_id)
    WHERE status IN ('PENDING', 'CONFIRMED');

-- Deleting a category with registrations must fail instead of cascading into
-- participant, payment, ticket, and check-in history.
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
