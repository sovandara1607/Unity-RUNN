-- +goose Up
CREATE TABLE site_setting_versions (
    id          BIGSERIAL PRIMARY KEY,
    settings    JSONB NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_setting_versions_created_at
    ON site_setting_versions (created_at DESC, id DESC);

-- Preserve the state that existed when version control was enabled.
INSERT INTO site_setting_versions (settings, created_by, created_at)
SELECT to_jsonb(settings) - 'id' - 'updated_by', settings.updated_by, settings.updated_at
FROM site_settings AS settings
WHERE settings.id = 1;

-- +goose Down
DROP TABLE IF EXISTS site_setting_versions;
