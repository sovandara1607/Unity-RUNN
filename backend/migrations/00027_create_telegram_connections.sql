-- +goose Up
CREATE TABLE telegram_connections (
    user_id              UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    chat_id              BIGINT NOT NULL UNIQUE,
    telegram_user_id     BIGINT NOT NULL,
    username             TEXT NOT NULL DEFAULT '',
    first_name           TEXT NOT NULL DEFAULT '',
    linked_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE telegram_link_tokens (
    token_hash           BYTEA PRIMARY KEY,
    user_id              UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    expires_at           TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_link_tokens_expires_at ON telegram_link_tokens (expires_at);

-- +goose Down
DROP TABLE telegram_link_tokens;
DROP TABLE telegram_connections;
