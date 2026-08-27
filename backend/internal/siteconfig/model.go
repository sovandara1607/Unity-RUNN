package siteconfig

import (
	"time"

	"github.com/google/uuid"
)

type HeroSlide struct {
	ImageURL string `json:"image_url"`
	Alt      string `json:"alt"`
	Eyebrow  string `json:"eyebrow"`
	Title    string `json:"title"`
	Copy     string `json:"copy"`
}

type Settings struct {
	ClubName              string      `json:"club_name"`
	LocationLabel         string      `json:"location_label"`
	LogoURL               string      `json:"logo_url"`
	PrimaryColor          string      `json:"primary_color"`
	AccentColor           string      `json:"accent_color"`
	BackgroundColor       string      `json:"background_color"`
	AnnouncementEnabled   bool        `json:"announcement_enabled"`
	AnnouncementText      string      `json:"announcement_text"`
	AnnouncementHref      string      `json:"announcement_href"`
	AnnouncementEventID   *uuid.UUID  `json:"announcement_event_id"`
	AnnouncementEventName string      `json:"announcement_event_name"`
	AnnouncementEventSlug string      `json:"announcement_event_slug"`
	HeroIntro             string      `json:"hero_intro"`
	HeroTitlePrimary      string      `json:"hero_title_primary"`
	HeroTitleSecondary    string      `json:"hero_title_secondary"`
	MissionEyebrow        string      `json:"mission_eyebrow"`
	MissionText           string      `json:"mission_text"`
	MissionSupportingText string      `json:"mission_supporting_text"`
	PrimaryCTALabel       string      `json:"primary_cta_label"`
	PrimaryCTAHref        string      `json:"primary_cta_href"`
	FooterText            string      `json:"footer_text"`
	ValueMessages         []string    `json:"value_messages"`
	HeroSlides            []HeroSlide `json:"hero_slides"`
	UpdatedAt             time.Time   `json:"updated_at"`
}

type Version struct {
	ID        int64     `json:"id"`
	Settings  Settings  `json:"settings"`
	CreatedBy *string   `json:"created_by,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type UpdateRequest struct {
	ClubName              string      `json:"club_name"`
	LocationLabel         string      `json:"location_label"`
	LogoURL               string      `json:"logo_url"`
	PrimaryColor          string      `json:"primary_color"`
	AccentColor           string      `json:"accent_color"`
	BackgroundColor       string      `json:"background_color"`
	AnnouncementEnabled   bool        `json:"announcement_enabled"`
	AnnouncementText      string      `json:"announcement_text"`
	AnnouncementHref      string      `json:"announcement_href"`
	AnnouncementEventID   *uuid.UUID  `json:"announcement_event_id"`
	HeroIntro             string      `json:"hero_intro"`
	HeroTitlePrimary      string      `json:"hero_title_primary"`
	HeroTitleSecondary    string      `json:"hero_title_secondary"`
	MissionEyebrow        string      `json:"mission_eyebrow"`
	MissionText           string      `json:"mission_text"`
	MissionSupportingText string      `json:"mission_supporting_text"`
	PrimaryCTALabel       string      `json:"primary_cta_label"`
	PrimaryCTAHref        string      `json:"primary_cta_href"`
	FooterText            string      `json:"footer_text"`
	ValueMessages         []string    `json:"value_messages"`
	HeroSlides            []HeroSlide `json:"hero_slides"`
}
