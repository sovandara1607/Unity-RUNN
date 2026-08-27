-- +goose Up
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));

-- +goose Down
DROP INDEX IF EXISTS users_email_lower_unique;
