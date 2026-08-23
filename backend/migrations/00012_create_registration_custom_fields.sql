-- +goose Up
CREATE TABLE registration_custom_fields (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id  UUID NOT NULL REFERENCES registrations (id) ON DELETE CASCADE,
    field_key        TEXT NOT NULL,
    field_value      TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_registration_custom_fields_registration_id
    ON registration_custom_fields (registration_id);

-- +goose Down
DROP TABLE registration_custom_fields;
