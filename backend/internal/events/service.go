package events

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ErrSlugTaken is returned when a create/update would collide with an
// existing event's slug.
var ErrSlugTaken = errors.New("events: slug already in use")

// ErrInvalidTransition is returned when a status update isn't a legal
// transition from the event's current status.
var ErrInvalidTransition = errors.New("events: invalid status transition")

// ErrDeleteNotAllowed is returned when attempting to delete an event
// that isn't in DRAFT status.
var ErrDeleteNotAllowed = errors.New("events: only draft events can be deleted")

// eventRepository is the subset of Repository the service depends on.
// Defined here (consumer side) so tests can supply a fake.
type eventRepository interface {
	List(ctx context.Context, filter ListFilter) ([]Event, int, error)
	GetByID(ctx context.Context, id uuid.UUID) (*Event, error)
	GetDetailBySlug(ctx context.Context, slug string) (*EventDetail, error)
	SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error)
	Create(ctx context.Context, e *Event) error
	Update(ctx context.Context, e *Event) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// Service implements event business rules on top of a repository.
type Service struct {
	repo eventRepository
}

// NewService builds a Service backed by repo.
func NewService(repo eventRepository) *Service {
	return &Service{repo: repo}
}

const (
	defaultListLimit = 20
	maxListLimit     = 100
)

// List returns events visible under filter. When includeAll is false,
// filter.Statuses is forced to the public status set regardless of
// what was requested (defense in depth — handlers should already
// enforce this via the admin-key check).
// filter is mutated in place with the effective (defaulted/clamped)
// limit and offset, so callers building a response envelope can
// report what was actually applied.
func (s *Service) List(ctx context.Context, filter *ListFilter, includeAll bool) ([]Event, int, error) {
	if !includeAll {
		filter.Statuses = nil // repository defaults to public statuses
	}
	if filter.Limit <= 0 {
		filter.Limit = defaultListLimit
	}
	if filter.Limit > maxListLimit {
		filter.Limit = maxListLimit
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	return s.repo.List(ctx, *filter)
}

// GetDetailBySlug returns the event detail for slug. If includeAll is
// false and the event's status isn't public, it's treated as not
// found (mirrors List's visibility rule).
func (s *Service) GetDetailBySlug(ctx context.Context, slug string, includeAll bool) (*EventDetail, error) {
	detail, err := s.repo.GetDetailBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if !includeAll && !detail.Status.IsPublic() {
		return nil, ErrNotFound
	}
	return detail, nil
}

// Create validates and persists a new event in DRAFT status.
func (s *Service) Create(ctx context.Context, req CreateEventRequest) (*Event, error) {
	slug := req.Slug
	if slug == "" {
		slug = slugify(req.Name)
	}

	taken, err := s.repo.SlugExists(ctx, slug, nil)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, ErrSlugTaken
	}

	eventDate, err := time.Parse("2006-01-02", req.EventDate)
	if err != nil {
		return nil, fmt.Errorf("events: invalid event_date: %w", err)
	}
	startTime, err := time.Parse("15:04", req.StartTime)
	if err != nil {
		return nil, fmt.Errorf("events: invalid start_time: %w", err)
	}

	e := &Event{
		Name:                req.Name,
		Slug:                slug,
		Description:         req.Description,
		CoverImage:          req.CoverImage,
		EventDate:           eventDate,
		StartTime:           startTime,
		Location:            req.Location,
		Latitude:            req.Latitude,
		Longitude:           req.Longitude,
		RegistrationOpenAt:  req.RegistrationOpenAt,
		RegistrationCloseAt: req.RegistrationCloseAt,
		Status:              StatusDraft,
	}

	if err := s.repo.Create(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

// Update applies a partial update to the event identified by id,
// validating the slug (if changed) and any status transition.
func (s *Service) Update(ctx context.Context, id uuid.UUID, req UpdateEventRequest) (*Event, error) {
	e, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Slug != nil && *req.Slug != e.Slug {
		taken, err := s.repo.SlugExists(ctx, *req.Slug, &id)
		if err != nil {
			return nil, err
		}
		if taken {
			return nil, ErrSlugTaken
		}
		e.Slug = *req.Slug
	}

	if req.Name != nil {
		e.Name = *req.Name
	}
	if req.Description != nil {
		e.Description = *req.Description
	}
	if req.CoverImage != nil {
		e.CoverImage = *req.CoverImage
	}
	if req.EventDate != nil {
		d, err := time.Parse("2006-01-02", *req.EventDate)
		if err != nil {
			return nil, fmt.Errorf("events: invalid event_date: %w", err)
		}
		e.EventDate = d
	}
	if req.StartTime != nil {
		t, err := time.Parse("15:04", *req.StartTime)
		if err != nil {
			return nil, fmt.Errorf("events: invalid start_time: %w", err)
		}
		e.StartTime = t
	}
	if req.Location != nil {
		e.Location = *req.Location
	}
	if req.Latitude != nil {
		e.Latitude = req.Latitude
	}
	if req.Longitude != nil {
		e.Longitude = req.Longitude
	}
	if req.RegistrationOpenAt != nil {
		e.RegistrationOpenAt = req.RegistrationOpenAt
	}
	if req.RegistrationCloseAt != nil {
		e.RegistrationCloseAt = req.RegistrationCloseAt
	}
	if req.Status != nil {
		if !req.Status.IsValid() {
			return nil, fmt.Errorf("events: invalid status %q", *req.Status)
		}
		if !e.Status.CanTransitionTo(*req.Status) {
			return nil, ErrInvalidTransition
		}
		e.Status = *req.Status
	}

	if err := s.repo.Update(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

// Delete removes an event, but only while it's still in DRAFT status.
func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	e, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if e.Status != StatusDraft {
		return ErrDeleteNotAllowed
	}
	return s.repo.Delete(ctx, id)
}

// slugify converts a name into a URL-safe slug: lowercase,
// non-alphanumerics collapsed to single hyphens, trimmed.
func slugify(name string) string {
	var b strings.Builder
	prevHyphen := false
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			prevHyphen = false
		default:
			if !prevHyphen && b.Len() > 0 {
				b.WriteRune('-')
				prevHyphen = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}
