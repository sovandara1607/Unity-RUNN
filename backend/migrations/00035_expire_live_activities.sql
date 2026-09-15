-- +goose Up
UPDATE live_activities
SET expires_at = created_at + interval '8 hours'
WHERE expires_at IS NULL;

ALTER TABLE live_activities
    ALTER COLUMN expires_at SET DEFAULT (now() + interval '8 hours'),
    ALTER COLUMN expires_at SET NOT NULL;

-- +goose Down
ALTER TABLE live_activities
    ALTER COLUMN expires_at DROP NOT NULL,
    ALTER COLUMN expires_at DROP DEFAULT;
