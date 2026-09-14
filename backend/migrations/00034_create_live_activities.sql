-- +goose Up
CREATE TABLE live_activities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_id         UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    registration_id  UUID REFERENCES registrations (id) ON DELETE SET NULL,
    -- ActivityKit's own activity identifier (opaque to the backend, generated
    -- on-device); push_token is the separate APNs "push-to-update" token for
    -- that specific activity, not a device-wide push token.
    activity_id      TEXT NOT NULL,
    device_id        TEXT NOT NULL DEFAULT '',
    push_token       TEXT NOT NULL DEFAULT '',
    platform         TEXT NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios')),
    status           TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'ENDED', 'EXPIRED')),
    race_status      TEXT NOT NULL DEFAULT 'UPCOMING'
        CHECK (race_status IN ('UPCOMING', 'CHECK_IN', 'STARTING', 'LIVE', 'FINISHED', 'CANCELLED')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ,
    ended_at         TIMESTAMPTZ
);

-- A runner can re-follow after ending an activity (history is kept, not
-- overwritten), but never has two ACTIVE activities for the same event --
-- this is the actual enforcement for "duplicate activity prevention",
-- not just an application-level check that a race condition could slip past.
CREATE UNIQUE INDEX idx_live_activities_one_active_per_user_event
    ON live_activities (user_id, event_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_live_activities_user ON live_activities (user_id, created_at DESC);
CREATE INDEX idx_live_activities_event ON live_activities (event_id);
-- Expired-token sweep (see item 13's "expired tokens should not remain active
-- indefinitely"): a worker can scan ACTIVE rows past expires_at.
CREATE INDEX idx_live_activities_expiring
    ON live_activities (expires_at) WHERE status = 'ACTIVE';

-- +goose Down
DROP TABLE live_activities;
