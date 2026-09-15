-- +goose Up
-- idx_users_email (plain btree on email) has been dead weight since it was
-- created in 00007: the column's own UNIQUE constraint already provides an
-- equivalent index (users_email_key), and every real lookup goes through
-- lower(email) since 00020, served by users_email_lower_unique instead.
-- Confirmed no query anywhere filters on plain `email =`.
DROP INDEX idx_users_email;

-- +goose Down
CREATE INDEX idx_users_email ON users (email);
