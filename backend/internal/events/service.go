package events

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ErrSlugTaken is returned when a create/update would collide with an existing event's slug
var ErrSlugTaken = errors.New("events: slug already in use")

// ErrInvalidTransition is returned when a status update isn't a legal transition from the event's current status
var ErrInvalidTransition = errors.New("events: invalid status transition")

// ErrDeleteNotAllowed is returned when attempting to delete an event that isn't in DRAFT status
var ErrDeleteNotAllowed = errors.New("events: only draft events can be deleted")

// ErrCategoryInUse protects registration and check-in history from deletion
var ErrCategoryInUse = errors.New("events: category has registrations")

// ErrInvalidCoordinates is returned when only half of a map pin is supplied
var ErrInvalidCoordinates = errors.New("events: latitude and longitude must be provided together")

// eventRepository is the subset of Repository the service depends on
// Defined here (consumer side) so tests can supply a fake.
type eventRepository interface {
	List(ctx context.Context, filter ListFilter) ([]Event, int, error)
	GetByID(ctx context.Context, id uuid.UUID) (*Event, error)
	GetDetailBySlug(ctx context.Context, slug string) (*EventDetail, error)
	SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error)
	Create(ctx context.Context, e *Event) error
	Duplicate(ctx context.Context, sourceID uuid.UUID, clone *Event) error
	Update(ctx context.Context, e *Event) error
	Delete(ctx context.Context, id uuid.UUID) error
	GetCategoryByID(ctx context.Context, id uuid.UUID) (*EventCategory, error)
	listCategories(ctx context.Context, eventID uuid.UUID) ([]EventCategory, error)
	listSchedule(ctx context.Context, eventID uuid.UUID) ([]EventSchedule, error)
	CreateCategory(ctx context.Context, c *EventCategory) error
	UpdateCategory(ctx context.Context, id uuid.UUID, p *UpdateCategoryRequest) (*EventCategory, error)
	DeleteCategory(ctx context.Context, id uuid.UUID) error
	CreateScheduleItem(ctx context.Context, s *EventSchedule) error
	UpdateScheduleItem(ctx context.Context, id uuid.UUID, p *UpdateScheduleRequest) (*EventSchedule, error)
	DeleteScheduleItem(ctx context.Context, id uuid.UUID) error
	listFAQs(ctx context.Context, eventID uuid.UUID) ([]EventFAQ, error)
	CreateFAQ(ctx context.Context, faq *EventFAQ) error
	UpdateFAQ(ctx context.Context, id uuid.UUID, p *UpdateFAQRequest) (*EventFAQ, error)
	DeleteFAQ(ctx context.Context, id uuid.UUID) error
	listRules(ctx context.Context, eventID uuid.UUID) ([]EventRule, error)
	CreateRule(ctx context.Context, rule *EventRule) error
	UpdateRule(ctx context.Context, id uuid.UUID, p *UpdateRuleRequest) (*EventRule, error)
	DeleteRule(ctx context.Context, id uuid.UUID) error
}

// EventNotifier is implemented by internal/notifications (wired in from main.go) to email confirmed registrants when an event's key details change or it's cancelled. The interface lives here, in the consumer package, so events never imports notifications or registrations — same pattern as RegistrationNotifier in internal/registrations/service.go. Nil-safe.
type EventNotifier interface {
	NotifyEventUpdated(ctx context.Context, ev Event, changedFields []string)
	NotifyEventCancelled(ctx context.Context, ev Event)
}

// Service implements event business rules on top of a repository
type Service struct {
	repo     eventRepository
	notifier EventNotifier
}

// NewService builds a Service backed by repo. notifier may be nil (no emails sent — used by unit tests)
func NewService(repo eventRepository, notifier EventNotifier) *Service {
	return &Service{repo: repo, notifier: notifier}
}

const (
	defaultListLimit = 20
	maxListLimit     = 100
)

// List returns events visible under filter. Public callers may narrow the public statuses, but can never use a filter to reveal non-public events. filter is mutated in place with the effective (defaulted/clamped) limit and offset, so callers building a response envelope can report what was actually applied.
func (s *Service) List(ctx context.Context, filter *ListFilter, includeAll bool) ([]Event, int, error) {
	if !includeAll {
		if len(filter.Statuses) > 0 {
			public := make([]Status, 0, len(filter.Statuses))
			for _, status := range filter.Statuses {
				if status.IsPublic() {
					public = append(public, status)
				}
			}
			if len(public) == 0 {
				public = []Status{Status("__NO_PUBLIC_STATUS__")}
			}
			filter.Statuses = public
		}
	} else if len(filter.Statuses) == 0 {
		// Admin viewing "all" (no explicit status filter) should see
		// every status, including DRAFT/CANCELLED/ARCHIVED — not just
		// the public set the repository defaults to.
		filter.Statuses = allStatuses()
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

// GetDetailBySlug returns the event detail for slug. If includeAll is false and the event's status isn't public, it's treated as not found (mirrors List's visibility rule).
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

// GetByID returns an event by ID (admin only — no visibility filtering)
func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*Event, error) {
	return s.repo.GetByID(ctx, id)
}

// Create validates and persists a new event in DRAFT status
func (s *Service) Create(ctx context.Context, req CreateEventRequest) (*Event, error) {
	if (req.Latitude == nil) != (req.Longitude == nil) {
		return nil, ErrInvalidCoordinates
	}
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

// Duplicate creates a draft edition from an existing event. It carries reusable
// event content and child collections, while repository-level copying resets all
// registration windows and category deadlines in one transaction.
func (s *Service) Duplicate(ctx context.Context, sourceID uuid.UUID, req DuplicateEventRequest) (*Event, error) {
	if err := validate.Struct(req); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("events: duplicate name cannot be empty")
	}
	source, err := s.repo.GetByID(ctx, sourceID)
	if err != nil {
		return nil, err
	}
	eventDate, err := time.Parse("2006-01-02", req.EventDate)
	if err != nil {
		return nil, fmt.Errorf("events: invalid event_date: %w", err)
	}
	slug, err := s.availableDuplicateSlug(ctx, name)
	if err != nil {
		return nil, err
	}
	clone := &Event{
		Name: name, Slug: slug, Description: source.Description, CoverImage: source.CoverImage,
		EventDate: eventDate, StartTime: source.StartTime, Location: source.Location,
		Latitude: source.Latitude, Longitude: source.Longitude, Status: StatusDraft,
	}
	if err := s.repo.Duplicate(ctx, sourceID, clone); err != nil {
		return nil, err
	}
	return clone, nil
}

func (s *Service) availableDuplicateSlug(ctx context.Context, name string) (string, error) {
	base := slugify(name)
	if base == "" {
		return "", errors.New("events: duplicate name must contain letters or numbers")
	}
	for suffix := 1; suffix <= 1000; suffix++ {
		candidate := base
		if suffix > 1 {
			candidate = fmt.Sprintf("%s-%d", base, suffix)
		}
		taken, err := s.repo.SlugExists(ctx, candidate, nil)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
	return "", ErrSlugTaken
}

// Update applies a partial update to the event identified by id, validating the slug (if changed) and any status transition
func (s *Service) Update(ctx context.Context, id uuid.UUID, req UpdateEventRequest) (*Event, error) {
	if req.ClearCoordinates && (req.Latitude != nil || req.Longitude != nil) {
		return nil, ErrInvalidCoordinates
	}
	if !req.ClearCoordinates && (req.Latitude == nil) != (req.Longitude == nil) {
		return nil, ErrInvalidCoordinates
	}
	e, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Snapshot before mutation, to detect what actually changed for
	// the notifier — compared after the fields below are applied.
	before := *e

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
	if req.ClearCoordinates {
		e.Latitude = nil
		e.Longitude = nil
	} else if req.Latitude != nil {
		e.Latitude = req.Latitude
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

	s.notifyOfChange(ctx, before, *e)

	return e, nil
}

// notifyOfChange compares before/after and fires the appropriate notifier call, if any. Cancellation takes priority over a generic update notice — a registrant who just had their event cancelled shouldn't also get an "updated" email for the same transition.
func (s *Service) notifyOfChange(ctx context.Context, before, after Event) {
	if s.notifier == nil {
		return
	}

	if before.Status != StatusCancelled && after.Status == StatusCancelled {
		s.notifier.NotifyEventCancelled(ctx, after)
		return
	}

	var changed []string
	if !before.EventDate.Equal(after.EventDate) {
		changed = append(changed, "event date")
	}
	if !before.StartTime.Equal(after.StartTime) {
		changed = append(changed, "start time")
	}
	coordinatesChanged := (before.Latitude == nil) != (after.Latitude == nil) || (before.Longitude == nil) != (after.Longitude == nil)
	if before.Latitude != nil && after.Latitude != nil && *before.Latitude != *after.Latitude {
		coordinatesChanged = true
	}
	if before.Longitude != nil && after.Longitude != nil && *before.Longitude != *after.Longitude {
		coordinatesChanged = true
	}
	if before.Location != after.Location || coordinatesChanged {
		changed = append(changed, "location")
	}
	if len(changed) > 0 {
		s.notifier.NotifyEventUpdated(ctx, after, changed)
	}
}

// Delete removes an event, but only while it's still in DRAFT status
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

// slugify converts a name into a URL-safe slug: lowercase, non-alphanumerics collapsed to single hyphens, trimmed
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

// CreateCategory adds a registerable category to an event
func (s *Service) CreateCategory(ctx context.Context, eventID uuid.UUID, req CreateCategoryRequest) (*EventCategory, error) {
	if err := validate.Struct(req); err != nil {
		return nil, err
	}
	if _, err := s.repo.GetByID(ctx, eventID); err != nil {
		return nil, err
	}
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "USD"
	}
	c := &EventCategory{
		EventID:              eventID,
		Name:                 req.Name,
		Distance:             req.Distance,
		PriceCents:           req.PriceCents,
		Currency:             currency,
		Capacity:             req.Capacity,
		RegistrationDeadline: req.RegistrationDeadline,
		Status:               "OPEN",
	}
	if err := s.repo.CreateCategory(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

// UpdateCategory patches a category that belongs to eventID
func (s *Service) UpdateCategory(ctx context.Context, eventID, categoryID uuid.UUID, req UpdateCategoryRequest) (*EventCategory, error) {
	if err := validate.Struct(req); err != nil {
		return nil, err
	}
	if req.ClearRegistrationDeadline && req.RegistrationDeadline != nil {
		return nil, errors.New("events: cannot set and clear the category registration deadline together")
	}
	c, err := s.repo.GetCategoryByID(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	if c.EventID != eventID {
		return nil, ErrNotFound
	}
	return s.repo.UpdateCategory(ctx, categoryID, &req)
}

// DeleteCategory removes a category that belongs to eventID
func (s *Service) DeleteCategory(ctx context.Context, eventID, categoryID uuid.UUID) error {
	c, err := s.repo.GetCategoryByID(ctx, categoryID)
	if err != nil {
		return err
	}
	if c.EventID != eventID {
		return ErrNotFound
	}
	return s.repo.DeleteCategory(ctx, categoryID)
}

// ListCategories returns an event's categories
func (s *Service) ListCategories(ctx context.Context, eventID uuid.UUID) ([]EventCategory, error) {
	if _, err := s.repo.GetByID(ctx, eventID); err != nil {
		return nil, err
	}
	return s.repo.listCategories(ctx, eventID)
}

// CreateScheduleItem adds a day-of schedule line to an event
func (s *Service) CreateScheduleItem(ctx context.Context, eventID uuid.UUID, req CreateScheduleRequest) (*EventSchedule, error) {
	if err := validate.Struct(req); err != nil {
		return nil, err
	}
	if _, err := s.repo.GetByID(ctx, eventID); err != nil {
		return nil, err
	}
	t, err := time.Parse("15:04:05", req.Time)
	if err != nil {
		t, err = time.Parse("15:04", req.Time)
		if err != nil {
			return nil, err
		}
	}
	item := &EventSchedule{
		EventID:     eventID,
		Time:        t,
		Title:       req.Title,
		Description: req.Description,
		SortOrder:   req.SortOrder,
	}
	if err := s.repo.CreateScheduleItem(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

// UpdateScheduleItem patches a schedule line that belongs to eventID
func (s *Service) UpdateScheduleItem(ctx context.Context, eventID, scheduleID uuid.UUID, req UpdateScheduleRequest) (*EventSchedule, error) {
	if err := validate.Struct(req); err != nil {
		return nil, err
	}
	item, err := s.getScheduleItem(ctx, eventID, scheduleID)
	if err != nil {
		return nil, err
	}
	return s.repo.UpdateScheduleItem(ctx, item.ID, &req)
}

// DeleteScheduleItem removes a schedule line that belongs to eventID
func (s *Service) DeleteScheduleItem(ctx context.Context, eventID, scheduleID uuid.UUID) error {
	item, err := s.getScheduleItem(ctx, eventID, scheduleID)
	if err != nil {
		return err
	}
	return s.repo.DeleteScheduleItem(ctx, item.ID)
}

// ListSchedule returns an event's day-of schedule lines in order
func (s *Service) ListSchedule(ctx context.Context, eventID uuid.UUID) ([]EventSchedule, error) {
	if _, err := s.repo.GetByID(ctx, eventID); err != nil {
		return nil, err
	}
	return s.repo.listSchedule(ctx, eventID)
}

// getScheduleItem fetches a single schedule item by ID
func (s *Service) getScheduleItem(ctx context.Context, eventID, scheduleID uuid.UUID) (*EventSchedule, error) {
	items, err := s.repo.listSchedule(ctx, eventID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		if items[i].ID == scheduleID {
			return &items[i], nil
		}
	}
	return nil, ErrNotFound
}

// CreateFAQ adds a public question and answer to an event.
func (s *Service) CreateFAQ(ctx context.Context, eventID uuid.UUID, req CreateFAQRequest) (*EventFAQ, error) {
	if err := validate.Struct(req); err != nil {
		return nil, err
	}
	if _, err := s.repo.GetByID(ctx, eventID); err != nil {
		return nil, err
	}
	question, answer := strings.TrimSpace(req.Question), strings.TrimSpace(req.Answer)
	if question == "" || answer == "" {
		return nil, errors.New("events: FAQ question and answer cannot be empty")
	}
	faq := &EventFAQ{EventID: eventID, Question: question, Answer: answer, SortOrder: req.SortOrder}
	if err := s.repo.CreateFAQ(ctx, faq); err != nil {
		return nil, err
	}
	return faq, nil
}

// UpdateFAQ patches an FAQ that belongs to eventID.
func (s *Service) UpdateFAQ(ctx context.Context, eventID, faqID uuid.UUID, req UpdateFAQRequest) (*EventFAQ, error) {
	if err := validate.Struct(req); err != nil {
		return nil, err
	}
	faq, err := s.getFAQ(ctx, eventID, faqID)
	if err != nil {
		return nil, err
	}
	if req.Question != nil {
		trimmed := strings.TrimSpace(*req.Question)
		if trimmed == "" {
			return nil, errors.New("events: FAQ question cannot be empty")
		}
		req.Question = &trimmed
	}
	if req.Answer != nil {
		trimmed := strings.TrimSpace(*req.Answer)
		if trimmed == "" {
			return nil, errors.New("events: FAQ answer cannot be empty")
		}
		req.Answer = &trimmed
	}
	return s.repo.UpdateFAQ(ctx, faq.ID, &req)
}

// DeleteFAQ removes an FAQ that belongs to eventID.
func (s *Service) DeleteFAQ(ctx context.Context, eventID, faqID uuid.UUID) error {
	faq, err := s.getFAQ(ctx, eventID, faqID)
	if err != nil {
		return err
	}
	return s.repo.DeleteFAQ(ctx, faq.ID)
}

func (s *Service) getFAQ(ctx context.Context, eventID, faqID uuid.UUID) (*EventFAQ, error) {
	items, err := s.repo.listFAQs(ctx, eventID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		if items[i].ID == faqID {
			return &items[i], nil
		}
	}
	return nil, ErrNotFound
}

// CreateRule adds a public participation rule to an event.
func (s *Service) CreateRule(ctx context.Context, eventID uuid.UUID, req CreateRuleRequest) (*EventRule, error) {
	if err := validate.Struct(req); err != nil {
		return nil, err
	}
	if _, err := s.repo.GetByID(ctx, eventID); err != nil {
		return nil, err
	}
	ruleText := strings.TrimSpace(req.Rule)
	if ruleText == "" {
		return nil, errors.New("events: rule cannot be empty")
	}
	rule := &EventRule{EventID: eventID, Rule: ruleText, SortOrder: req.SortOrder}
	if err := s.repo.CreateRule(ctx, rule); err != nil {
		return nil, err
	}
	return rule, nil
}

// UpdateRule patches a rule that belongs to eventID.
func (s *Service) UpdateRule(ctx context.Context, eventID, ruleID uuid.UUID, req UpdateRuleRequest) (*EventRule, error) {
	if err := validate.Struct(req); err != nil {
		return nil, err
	}
	rule, err := s.getRule(ctx, eventID, ruleID)
	if err != nil {
		return nil, err
	}
	if req.Rule != nil {
		trimmed := strings.TrimSpace(*req.Rule)
		if trimmed == "" {
			return nil, errors.New("events: rule cannot be empty")
		}
		req.Rule = &trimmed
	}
	return s.repo.UpdateRule(ctx, rule.ID, &req)
}

// DeleteRule removes a rule that belongs to eventID.
func (s *Service) DeleteRule(ctx context.Context, eventID, ruleID uuid.UUID) error {
	rule, err := s.getRule(ctx, eventID, ruleID)
	if err != nil {
		return err
	}
	return s.repo.DeleteRule(ctx, rule.ID)
}

func (s *Service) getRule(ctx context.Context, eventID, ruleID uuid.UUID) (*EventRule, error) {
	items, err := s.repo.listRules(ctx, eventID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		if items[i].ID == ruleID {
			return &items[i], nil
		}
	}
	return nil, ErrNotFound
}
