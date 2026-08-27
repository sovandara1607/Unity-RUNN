-- +goose Up
ALTER TABLE site_settings
    ADD COLUMN announcement_event_id UUID REFERENCES events(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE site_settings DROP COLUMN IF EXISTS announcement_event_id;
