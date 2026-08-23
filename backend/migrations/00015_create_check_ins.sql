-- +goose Up
CREATE TABLE check_ins (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id  UUID NOT NULL UNIQUE REFERENCES registrations (id) ON DELETE CASCADE,
    staff_user_id    UUID NOT NULL REFERENCES users (id),
    checked_in_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE check_ins;
