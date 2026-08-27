-- +goose Up
-- Authentication normalizes email addresses to lowercase. Enforce the same
-- identity boundary in PostgreSQL so case variants cannot create two accounts.
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));

-- +goose Down
DROP INDEX IF EXISTS users_email_lower_unique;
