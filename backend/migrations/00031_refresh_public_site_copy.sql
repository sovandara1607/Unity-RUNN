-- +goose Up
UPDATE site_settings
SET hero_intro = 'Community runs and race days for Phnom Penh runners.',
    mission_eyebrow = 'Run together · Phnom Penh',
    mission_text = 'Unity Runn Club brings Phnom Penh runners together for community miles and race days.',
    mission_supporting_text = 'Find an upcoming race, register online, and keep your entry and QR ticket in one place.',
    primary_cta_label = 'Browse races',
    hero_slides = COALESCE((
        SELECT jsonb_agg(
            CASE slide_number
                WHEN 1 THEN slide || jsonb_build_object(
                    'title', 'Run with the crew.',
                    'copy', 'Join a community run, meet runners at your pace, and keep showing up.'
                )
                WHEN 2 THEN slide || jsonb_build_object(
                    'title', 'Train for race day.',
                    'copy', 'Choose an event, build toward the date, and arrive ready for the start.'
                )
                WHEN 3 THEN slide || jsonb_build_object(
                    'title', 'Finish together.',
                    'copy', 'Share the road, the result, and the next run with the people around you.'
                )
                ELSE slide
            END
            ORDER BY slide_number
        )
        FROM jsonb_array_elements(site_settings.hero_slides) WITH ORDINALITY AS slides(slide, slide_number)
    ), '[]'::jsonb),
    updated_at = now()
WHERE id = 1;

-- +goose Down
UPDATE site_settings
SET hero_intro = 'Run loud, together — quality training and real race days for Phnom Penh''s running community.',
    mission_eyebrow = 'Founded 2026 · Phnom Penh, Cambodia',
    mission_text = 'Unity Runn Club is a Cambodia-born crew making running more social, more useful, and more fun.',
    mission_supporting_text = 'We create quality training and events, then turn that energy into real opportunities for young runners.',
    primary_cta_label = 'Explore events',
    hero_slides = COALESCE((
        SELECT jsonb_agg(
            CASE slide_number
                WHEN 1 THEN slide || jsonb_build_object(
                    'title', 'Move as a crew.',
                    'copy', 'Easy starts, honest effort, and enough company to make the next kilometre feel possible.'
                )
                WHEN 2 THEN slide || jsonb_build_object(
                    'title', 'Earn the start line.',
                    'copy', 'Training turns into something real when the road closes, the clock starts, and everyone commits.'
                )
                WHEN 3 THEN slide || jsonb_build_object(
                    'title', 'Stay for the people.',
                    'copy', 'The finish matters. So do the conversations, encouragement, and friendships that follow it.'
                )
                ELSE slide
            END
            ORDER BY slide_number
        )
        FROM jsonb_array_elements(site_settings.hero_slides) WITH ORDINALITY AS slides(slide, slide_number)
    ), '[]'::jsonb),
    updated_at = now()
WHERE id = 1;
