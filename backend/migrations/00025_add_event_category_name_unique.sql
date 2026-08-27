-- +goose Up
CREATE UNIQUE INDEX idx_event_categories_event_id_name
    ON event_categories (event_id, name);

-- +goose Down
DROP INDEX idx_event_categories_event_id_name;
