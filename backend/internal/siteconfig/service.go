package siteconfig

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

var ErrInvalidSettings = errors.New("siteconfig: invalid settings")
var ErrVersionNotFound = errors.New("siteconfig: version not found")
var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type repository interface {
	Get(ctx context.Context) (*Settings, error)
	Update(ctx context.Context, actorID uuid.UUID, settings Settings) (*Settings, error)
	ListVersions(ctx context.Context, limit int) ([]Version, error)
	GetVersion(ctx context.Context, id int64) (*Settings, error)
}
type ChangePublisher interface {
	PublishSiteConfig(ctx context.Context, settings Settings)
}

type Service struct {
	repo      repository
	publisher ChangePublisher
}

func NewService(repo repository, publisher ...ChangePublisher) *Service {
	service := &Service{repo: repo}
	if len(publisher) > 0 {
		service.publisher = publisher[0]
	}
	return service
}
func (s *Service) Get(ctx context.Context) (*Settings, error) { return s.repo.Get(ctx) }
func (s *Service) ListVersions(ctx context.Context, limit int) ([]Version, error) {
	if limit < 1 || limit > 100 {
		limit = 25
	}
	return s.repo.ListVersions(ctx, limit)
}

func (s *Service) Restore(ctx context.Context, actorID uuid.UUID, versionID int64) (*Settings, error) {
	if versionID < 1 {
		return nil, ErrVersionNotFound
	}
	settings, err := s.repo.GetVersion(ctx, versionID)
	if err != nil {
		return nil, err
	}
	if !valid(*settings) {
		return nil, ErrInvalidSettings
	}
	updated, err := s.repo.Update(ctx, actorID, *settings)
	if err == nil && s.publisher != nil {
		s.publisher.PublishSiteConfig(ctx, *updated)
	}
	return updated, err
}

func (s *Service) Update(ctx context.Context, actorID uuid.UUID, req UpdateRequest) (*Settings, error) {
	settings := Settings{
		ClubName: strings.TrimSpace(req.ClubName), LocationLabel: strings.TrimSpace(req.LocationLabel), LogoURL: strings.TrimSpace(req.LogoURL),
		PrimaryColor: req.PrimaryColor, AccentColor: req.AccentColor, BackgroundColor: req.BackgroundColor,
		AnnouncementEnabled: req.AnnouncementEnabled, AnnouncementText: strings.TrimSpace(req.AnnouncementText), AnnouncementHref: strings.TrimSpace(req.AnnouncementHref), AnnouncementEventID: req.AnnouncementEventID,
		HeroIntro: strings.TrimSpace(req.HeroIntro), HeroTitlePrimary: strings.TrimSpace(req.HeroTitlePrimary), HeroTitleSecondary: strings.TrimSpace(req.HeroTitleSecondary),
		MissionEyebrow: strings.TrimSpace(req.MissionEyebrow), MissionText: strings.TrimSpace(req.MissionText), MissionSupportingText: strings.TrimSpace(req.MissionSupportingText),
		PrimaryCTALabel: strings.TrimSpace(req.PrimaryCTALabel), PrimaryCTAHref: strings.TrimSpace(req.PrimaryCTAHref), FooterText: strings.TrimSpace(req.FooterText),
		ValueMessages: req.ValueMessages, HeroSlides: req.HeroSlides,
	}
	for index := range settings.ValueMessages {
		settings.ValueMessages[index] = strings.TrimSpace(settings.ValueMessages[index])
	}
	for index := range settings.HeroSlides {
		slide := &settings.HeroSlides[index]
		slide.ImageURL = strings.TrimSpace(slide.ImageURL)
		slide.Alt = strings.TrimSpace(slide.Alt)
		slide.Eyebrow = strings.TrimSpace(slide.Eyebrow)
		slide.Title = strings.TrimSpace(slide.Title)
		slide.Copy = strings.TrimSpace(slide.Copy)
	}
	if !valid(settings) {
		return nil, ErrInvalidSettings
	}
	updated, err := s.repo.Update(ctx, actorID, settings)
	if err == nil && s.publisher != nil {
		s.publisher.PublishSiteConfig(ctx, *updated)
	}
	return updated, err
}

func valid(s Settings) bool {
	if s.ClubName == "" || len(s.ClubName) > 80 || s.LocationLabel == "" || len(s.LocationLabel) > 80 ||
		!hexColor.MatchString(s.PrimaryColor) || !hexColor.MatchString(s.AccentColor) || !hexColor.MatchString(s.BackgroundColor) ||
		len(s.LogoURL) > 2048 || len(s.AnnouncementText) > 180 || len(s.AnnouncementHref) > 2048 ||
		s.HeroIntro == "" || len(s.HeroIntro) > 300 || s.HeroTitlePrimary == "" || len(s.HeroTitlePrimary) > 40 ||
		s.HeroTitleSecondary == "" || len(s.HeroTitleSecondary) > 40 || len(s.MissionEyebrow) > 200 || s.MissionText == "" || len(s.MissionText) > 500 ||
		len(s.MissionSupportingText) > 500 || s.PrimaryCTALabel == "" || len(s.PrimaryCTALabel) > 60 ||
		len(s.PrimaryCTAHref) > 2048 || !safeURL(s.PrimaryCTAHref, false) || !safeURL(s.LogoURL, true) || len(s.FooterText) > 160 ||
		len(s.ValueMessages) < 1 || len(s.ValueMessages) > 6 || len(s.HeroSlides) < 1 || len(s.HeroSlides) > 6 {
		return false
	}
	if s.AnnouncementEnabled && (s.AnnouncementText == "" || len(s.AnnouncementText) > 180 || s.AnnouncementEventID == nil) {
		return false
	}
	if !safeURL(s.AnnouncementHref, true) {
		return false
	}
	for _, value := range s.ValueMessages {
		if strings.TrimSpace(value) == "" || len(value) > 80 {
			return false
		}
	}
	for _, slide := range s.HeroSlides {
		if len(slide.ImageURL) > 2048 || !safeURL(slide.ImageURL, false) || slide.Alt == "" || len(slide.Alt) > 240 ||
			strings.TrimSpace(slide.Title) == "" || len(slide.Title) > 100 || len(slide.Eyebrow) > 100 || len(slide.Copy) > 300 {
			return false
		}
	}
	return true
}

func safeURL(raw string, allowEmpty bool) bool {
	if raw == "" {
		return allowEmpty
	}
	if strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") && !strings.Contains(raw, "\\") {
		return true
	}
	parsed, err := url.Parse(raw)
	return err == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != ""
}
