-- +goose Up
CREATE TABLE profiles (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    full_name                TEXT NOT NULL,
    phone                    TEXT NOT NULL DEFAULT '',
    date_of_birth            DATE,
    gender                   TEXT NOT NULL DEFAULT '',
    emergency_contact_name   TEXT NOT NULL DEFAULT '',
    emergency_contact_phone  TEXT NOT NULL DEFAULT '',
    tshirt_size              TEXT NOT NULL DEFAULT '',
    avatar_url               TEXT NOT NULL DEFAULT '',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE profiles;
