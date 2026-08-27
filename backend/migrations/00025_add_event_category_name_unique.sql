-- +goose Up
-- Lets seeding/admin tooling upsert a category by (event_id, name) instead of
-- deleting and recreating it, which now fails once a category has
-- registrations (event_categories -> registrations is ON DELETE RESTRICT
-- as of migration 00018).
CREATE UNIQUE INDEX idx_event_categories_event_id_name
    ON event_categories (event_id, name);

-- +goose Down
DROP INDEX idx_event_categories_event_id_name;
