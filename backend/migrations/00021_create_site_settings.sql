-- +goose Up
CREATE TABLE site_settings (
    id                       SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    club_name                TEXT NOT NULL,
    location_label           TEXT NOT NULL,
    logo_url                 TEXT NOT NULL DEFAULT '',
    primary_color            TEXT NOT NULL,
    accent_color             TEXT NOT NULL,
    background_color         TEXT NOT NULL,
    announcement_enabled     BOOLEAN NOT NULL DEFAULT false,
    announcement_text        TEXT NOT NULL DEFAULT '',
    announcement_href        TEXT NOT NULL DEFAULT '',
    hero_intro               TEXT NOT NULL,
    hero_title_primary       TEXT NOT NULL,
    hero_title_secondary     TEXT NOT NULL,
    mission_eyebrow          TEXT NOT NULL,
    mission_text             TEXT NOT NULL,
    mission_supporting_text  TEXT NOT NULL,
    primary_cta_label        TEXT NOT NULL,
    primary_cta_href         TEXT NOT NULL,
    footer_text              TEXT NOT NULL,
    value_messages           JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(value_messages) = 'array'),
    hero_slides              JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hero_slides) = 'array'),
    updated_by               UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_settings (
    club_name, location_label, primary_color, accent_color, background_color,
    hero_intro, hero_title_primary, hero_title_secondary, mission_eyebrow,
    mission_text, mission_supporting_text, primary_cta_label, primary_cta_href,
    footer_text, value_messages, hero_slides
) VALUES (
    'Unity Runn Club', 'Phnom Penh · KH', '#d9ff00', '#3155ff', '#111111',
    'Community runs and race days for Phnom Penh runners.',
    'Unity', 'Run Club', 'Run together · Phnom Penh',
    'Unity Runn Club brings Phnom Penh runners together for community miles and race days.',
    'Find an upcoming race, register online, and keep your entry and QR ticket in one place.',
    'Browse races', '/events', 'Unity Runn Club · Phnom Penh, Cambodia',
    '["Grow the sport", "Back the next wave", "Connect the good stuff"]'::jsonb,
    '[
      {"image_url":"/images/club/riverside-run.jpg","alt":"Unity runners moving together along the Phnom Penh riverside at dawn","eyebrow":"Dawn miles · Riverside","title":"Run with the crew.","copy":"Join a community run, meet runners at your pace, and keep showing up."},
      {"image_url":"/images/club/race-start.jpg","alt":"Runners accelerating together at a community race start in Phnom Penh","eyebrow":"Race morning · Phnom Penh","title":"Train for race day.","copy":"Choose an event, build toward the date, and arrive ready for the start."},
      {"image_url":"/images/club/finish-together.jpg","alt":"Run club members recovering and celebrating together after a morning run","eyebrow":"After the run · Together","title":"Finish together.","copy":"Share the road, the result, and the next run with the people around you."}
    ]'::jsonb
);

-- +goose Down
DROP TABLE IF EXISTS site_settings;
