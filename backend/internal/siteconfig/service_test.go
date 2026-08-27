package siteconfig

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

type stubRepository struct {
	updated  *Settings
	version  *Settings
	versions []Version
	err      error
}

type stubPublisher struct {
	published []Settings
}

func (s *stubPublisher) PublishSiteConfig(_ context.Context, settings Settings) {
	s.published = append(s.published, settings)
}

func (s *stubRepository) Get(context.Context) (*Settings, error) { return s.updated, s.err }
func (s *stubRepository) Update(_ context.Context, _ uuid.UUID, settings Settings) (*Settings, error) {
	s.updated = &settings
	return s.updated, s.err
}
func (s *stubRepository) ListVersions(context.Context, int) ([]Version, error) {
	return s.versions, s.err
}
func (s *stubRepository) GetVersion(context.Context, int64) (*Settings, error) {
	if s.version == nil {
		return nil, ErrVersionNotFound
	}
	return s.version, s.err
}

func validRequest() UpdateRequest {
	eventID := uuid.New()
	return UpdateRequest{
		ClubName: " Unity Runn Club ", LocationLabel: "Phnom Penh · KH", LogoURL: "/uploads/site/logo.png",
		PrimaryColor: "#d9ff00", AccentColor: "#3155ff", BackgroundColor: "#111111",
		AnnouncementEnabled: true, AnnouncementText: "Registration is open", AnnouncementHref: "/events", AnnouncementEventID: &eventID,
		HeroIntro: "Run together.", HeroTitlePrimary: "Unity", HeroTitleSecondary: "Run Club",
		MissionEyebrow: "Cambodia", MissionText: "Make running social and useful.", MissionSupportingText: "Everyone has a start line.",
		PrimaryCTALabel: "Explore events", PrimaryCTAHref: "/events", FooterText: "Unity Runn Club",
		ValueMessages: []string{"Grow the sport"},
		HeroSlides:    []HeroSlide{{ImageURL: "/uploads/site/hero.webp", Alt: "Runners at dawn", Eyebrow: "Dawn miles", Title: "Move together", Copy: "Find your crew."}},
	}
}

func TestUpdateAcceptsSafeSettingsAndTrimsIdentity(t *testing.T) {
	repo := &stubRepository{}
	publisher := &stubPublisher{}
	settings, err := NewService(repo, publisher).Update(context.Background(), uuid.New(), validRequest())
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if settings.ClubName != "Unity Runn Club" {
		t.Fatalf("ClubName = %q, want trimmed name", settings.ClubName)
	}
	if repo.updated == nil {
		t.Fatal("repository was not updated")
	}
	if len(publisher.published) != 1 || publisher.published[0].ClubName != "Unity Runn Club" {
		t.Fatal("committed settings were not published for realtime clients")
	}
}

func TestUpdateRejectsUnsafeURLs(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*UpdateRequest)
	}{
		{"javascript CTA", func(req *UpdateRequest) { req.PrimaryCTAHref = "javascript:alert(1)" }},
		{"protocol-relative logo", func(req *UpdateRequest) { req.LogoURL = "//tracking.example/logo.png" }},
		{"unsafe slide", func(req *UpdateRequest) { req.HeroSlides[0].ImageURL = "data:image/svg+xml,bad" }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := validRequest()
			test.mutate(&req)
			_, err := NewService(&stubRepository{}).Update(context.Background(), uuid.New(), req)
			if !errors.Is(err, ErrInvalidSettings) {
				t.Fatalf("Update() error = %v, want ErrInvalidSettings", err)
			}
		})
	}
}

func TestUpdateDoesNotPublishWhenPersistenceFails(t *testing.T) {
	publisher := &stubPublisher{}
	repoErr := errors.New("database unavailable")
	_, err := NewService(&stubRepository{err: repoErr}, publisher).Update(context.Background(), uuid.New(), validRequest())
	if !errors.Is(err, repoErr) {
		t.Fatalf("Update() error = %v, want repository error", err)
	}
	if len(publisher.published) != 0 {
		t.Fatal("failed settings update was published to realtime clients")
	}
}

func TestUpdateRejectsInvalidStructure(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*UpdateRequest)
	}{
		{"invalid color", func(req *UpdateRequest) { req.PrimaryColor = "lime" }},
		{"no values", func(req *UpdateRequest) { req.ValueMessages = nil }},
		{"no slides", func(req *UpdateRequest) { req.HeroSlides = nil }},
		{"missing slide alt", func(req *UpdateRequest) { req.HeroSlides[0].Alt = "" }},
		{"missing announcement event", func(req *UpdateRequest) { req.AnnouncementEventID = nil }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := validRequest()
			test.mutate(&req)
			_, err := NewService(&stubRepository{}).Update(context.Background(), uuid.New(), req)
			if !errors.Is(err, ErrInvalidSettings) {
				t.Fatalf("Update() error = %v, want ErrInvalidSettings", err)
			}
		})
	}
}

func TestRestorePublishesSnapshotAsNewCurrentVersion(t *testing.T) {
	req := validRequest()
	snapshot := Settings{
		ClubName: req.ClubName, LocationLabel: req.LocationLabel, LogoURL: req.LogoURL,
		PrimaryColor: req.PrimaryColor, AccentColor: req.AccentColor, BackgroundColor: req.BackgroundColor,
		AnnouncementEnabled: req.AnnouncementEnabled, AnnouncementText: req.AnnouncementText, AnnouncementHref: req.AnnouncementHref, AnnouncementEventID: req.AnnouncementEventID,
		HeroIntro: req.HeroIntro, HeroTitlePrimary: req.HeroTitlePrimary, HeroTitleSecondary: req.HeroTitleSecondary,
		MissionEyebrow: req.MissionEyebrow, MissionText: req.MissionText, MissionSupportingText: req.MissionSupportingText,
		PrimaryCTALabel: req.PrimaryCTALabel, PrimaryCTAHref: req.PrimaryCTAHref, FooterText: req.FooterText,
		ValueMessages: req.ValueMessages, HeroSlides: req.HeroSlides,
	}
	repo := &stubRepository{version: &snapshot}
	publisher := &stubPublisher{}
	restored, err := NewService(repo, publisher).Restore(context.Background(), uuid.New(), 12)
	if err != nil {
		t.Fatalf("Restore() error = %v", err)
	}
	if restored.ClubName != snapshot.ClubName || repo.updated == nil {
		t.Fatal("Restore() did not publish the selected snapshot")
	}
	if len(publisher.published) != 1 || publisher.published[0].ClubName != snapshot.ClubName {
		t.Fatal("restored settings were not published for realtime clients")
	}
}

func TestRestoreRejectsMissingVersion(t *testing.T) {
	_, err := NewService(&stubRepository{}).Restore(context.Background(), uuid.New(), 99)
	if !errors.Is(err, ErrVersionNotFound) {
		t.Fatalf("Restore() error = %v, want ErrVersionNotFound", err)
	}
}
