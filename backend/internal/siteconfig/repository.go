package siteconfig

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const selectSettings = `
	SELECT settings.club_name, settings.location_label, settings.logo_url, settings.primary_color,
	       settings.accent_color, settings.background_color, settings.announcement_enabled,
	       settings.announcement_text, settings.announcement_href, settings.announcement_event_id,
	       COALESCE(events.name, ''), COALESCE(events.slug, ''), settings.hero_intro,
	       settings.hero_title_primary, settings.hero_title_secondary, settings.mission_eyebrow,
	       settings.mission_text, settings.mission_supporting_text, settings.primary_cta_label,
	       settings.primary_cta_href, settings.footer_text, settings.value_messages,
	       settings.hero_slides, settings.updated_at
	FROM site_settings AS settings
	LEFT JOIN events ON events.id = settings.announcement_event_id
	WHERE settings.id = 1`

func (r *Repository) Get(ctx context.Context) (*Settings, error) {
	return scanSettings(r.pool.QueryRow(ctx, selectSettings))
}

func (r *Repository) Update(ctx context.Context, actorID uuid.UUID, s Settings) (*Settings, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("siteconfig: begin update: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck -- safe after commit

	values, err := json.Marshal(s.ValueMessages)
	if err != nil {
		return nil, fmt.Errorf("siteconfig: encode values: %w", err)
	}
	slides, err := json.Marshal(s.HeroSlides)
	if err != nil {
		return nil, fmt.Errorf("siteconfig: encode slides: %w", err)
	}
	if s.AnnouncementEventID != nil {
		var eventExists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM events WHERE id = $1)`, s.AnnouncementEventID).Scan(&eventExists); err != nil {
			return nil, fmt.Errorf("siteconfig: check announcement event: %w", err)
		}
		if !eventExists {
			return nil, ErrInvalidSettings
		}
	}
	_, err = tx.Exec(ctx, `
		UPDATE site_settings SET
		 club_name=$1, location_label=$2, logo_url=$3, primary_color=$4, accent_color=$5,
		 background_color=$6, announcement_enabled=$7, announcement_text=$8, announcement_href=$9,
		 announcement_event_id=$10, hero_intro=$11,
		 hero_title_primary=$12, hero_title_secondary=$13, mission_eyebrow=$14,
		 mission_text=$15, mission_supporting_text=$16, primary_cta_label=$17, primary_cta_href=$18,
		 footer_text=$19, value_messages=$20, hero_slides=$21, updated_by=$22, updated_at=now()
		WHERE id=1`,
		s.ClubName, s.LocationLabel, s.LogoURL, s.PrimaryColor, s.AccentColor, s.BackgroundColor,
		s.AnnouncementEnabled, s.AnnouncementText, s.AnnouncementHref, s.AnnouncementEventID, s.HeroIntro,
		s.HeroTitlePrimary, s.HeroTitleSecondary, s.MissionEyebrow, s.MissionText,
		s.MissionSupportingText, s.PrimaryCTALabel, s.PrimaryCTAHref, s.FooterText,
		values, slides, actorID)
	if err != nil {
		return nil, err
	}
	updated, err := scanSettings(tx.QueryRow(ctx, selectSettings))
	if err != nil {
		return nil, err
	}
	snapshot, err := json.Marshal(updated)
	if err != nil {
		return nil, fmt.Errorf("siteconfig: encode version: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO site_setting_versions (settings, created_by, created_at)
		VALUES ($1, $2, $3)`, snapshot, actorID, updated.UpdatedAt); err != nil {
		return nil, fmt.Errorf("siteconfig: create version: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("siteconfig: commit update: %w", err)
	}
	return updated, nil
}

func (r *Repository) ListVersions(ctx context.Context, limit int) ([]Version, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT versions.id, versions.settings, users.email, versions.created_at
		FROM site_setting_versions AS versions
		LEFT JOIN users ON users.id = versions.created_by
		ORDER BY versions.created_at DESC, versions.id DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("siteconfig: list versions: %w", err)
	}
	defer rows.Close()

	versions := make([]Version, 0, limit)
	for rows.Next() {
		var version Version
		var snapshot []byte
		if err := rows.Scan(&version.ID, &snapshot, &version.CreatedBy, &version.CreatedAt); err != nil {
			return nil, fmt.Errorf("siteconfig: scan version: %w", err)
		}
		if err := json.Unmarshal(snapshot, &version.Settings); err != nil {
			return nil, fmt.Errorf("siteconfig: decode version: %w", err)
		}
		versions = append(versions, version)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("siteconfig: iterate versions: %w", err)
	}
	return versions, nil
}

func (r *Repository) GetVersion(ctx context.Context, id int64) (*Settings, error) {
	var snapshot []byte
	if err := r.pool.QueryRow(ctx, `SELECT settings FROM site_setting_versions WHERE id = $1`, id).Scan(&snapshot); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrVersionNotFound
		}
		return nil, fmt.Errorf("siteconfig: get version: %w", err)
	}
	var settings Settings
	if err := json.Unmarshal(snapshot, &settings); err != nil {
		return nil, fmt.Errorf("siteconfig: decode version: %w", err)
	}
	return &settings, nil
}

type rowScanner interface{ Scan(...any) error }

func scanSettings(row rowScanner) (*Settings, error) {
	var s Settings
	var values, slides []byte
	err := row.Scan(&s.ClubName, &s.LocationLabel, &s.LogoURL, &s.PrimaryColor, &s.AccentColor,
		&s.BackgroundColor, &s.AnnouncementEnabled, &s.AnnouncementText, &s.AnnouncementHref,
		&s.AnnouncementEventID, &s.AnnouncementEventName, &s.AnnouncementEventSlug,
		&s.HeroIntro, &s.HeroTitlePrimary, &s.HeroTitleSecondary, &s.MissionEyebrow, &s.MissionText,
		&s.MissionSupportingText, &s.PrimaryCTALabel, &s.PrimaryCTAHref, &s.FooterText,
		&values, &slides, &s.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("siteconfig: scan: %w", err)
	}
	if err := json.Unmarshal(values, &s.ValueMessages); err != nil {
		return nil, fmt.Errorf("siteconfig: decode values: %w", err)
	}
	if err := json.Unmarshal(slides, &s.HeroSlides); err != nil {
		return nil, fmt.Errorf("siteconfig: decode slides: %w", err)
	}
	return &s, nil
}
