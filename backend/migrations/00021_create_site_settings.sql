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
    'Run loud, together — quality training and real race days for Phnom Penh''s running community.',
    'Unity', 'Run Club', 'Founded 2026 · Phnom Penh, Cambodia',
    'Unity Runn Club is a Cambodia-born crew making running more social, more useful, and more fun.',
    'We create quality training and events, then turn that energy into real opportunities for young runners.',
    'Explore events', '/events', 'Unity Runn Club · Phnom Penh, Cambodia',
    '["Grow the sport", "Back the next wave", "Connect the good stuff"]'::jsonb,
    '[
      {"image_url":"/images/club/riverside-run.jpg","alt":"Unity runners moving together along the Phnom Penh riverside at dawn","eyebrow":"Dawn miles · Riverside","title":"Move as a crew.","copy":"Easy starts, honest effort, and enough company to make the next kilometre feel possible."},
      {"image_url":"/images/club/race-start.jpg","alt":"Runners accelerating together at a community race start in Phnom Penh","eyebrow":"Race morning · Phnom Penh","title":"Earn the start line.","copy":"Training turns into something real when the road closes, the clock starts, and everyone commits."},
      {"image_url":"/images/club/finish-together.jpg","alt":"Run club members recovering and celebrating together after a morning run","eyebrow":"After the run · Together","title":"Stay for the people.","copy":"The finish matters. So do the conversations, encouragement, and friendships that follow it."}
    ]'::jsonb
);

-- +goose Down
DROP TABLE IF EXISTS site_settings;
