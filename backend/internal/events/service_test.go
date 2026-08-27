package events

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

// fakeRepo is an in-memory eventRepository for service unit tests
type fakeRepo struct {
	events     map[uuid.UUID]*Event
	categories map[uuid.UUID]*EventCategory
	schedule   map[uuid.UUID]*EventSchedule
	lastFilter ListFilter
}

// newFakeRepo creates a new fake repository
func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		events:     map[uuid.UUID]*Event{},
		categories: map[uuid.UUID]*EventCategory{},
		schedule:   map[uuid.UUID]*EventSchedule{},
	}
}

// List returns the events matching the filter
func (f *fakeRepo) List(ctx context.Context, filter ListFilter) ([]Event, int, error) {
	f.lastFilter = filter
	var out []Event
	for _, e := range f.events {
		out = append(out, *e)
	}
	return out, len(out), nil
}

// GetByID returns the event with the given ID
func (f *fakeRepo) GetByID(ctx context.Context, id uuid.UUID) (*Event, error) {
	e, ok := f.events[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *e
	return &cp, nil
}

// GetDetailBySlug returns the event detail with the given slug
func (f *fakeRepo) GetDetailBySlug(ctx context.Context, slug string) (*EventDetail, error) {
	for _, e := range f.events {
		if e.Slug == slug {
			return &EventDetail{Event: *e}, nil
		}
	}
	return nil, ErrNotFound
}

// SlugExists returns true if the slug is already used by another event
func (f *fakeRepo) SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	for _, e := range f.events {
		if e.Slug == slug && (excludeID == nil || e.ID != *excludeID) {
			return true, nil
		}
	}
	return false, nil
}

// Create inserts a new event
func (f *fakeRepo) Create(ctx context.Context, e *Event) error {
	e.ID = uuid.New()
	e.CreatedAt = time.Now()
	e.UpdatedAt = time.Now()
	f.events[e.ID] = e
	return nil
}

// Update updates an event
func (f *fakeRepo) Update(ctx context.Context, e *Event) error {
	if _, ok := f.events[e.ID]; !ok {
		return ErrNotFound
	}
	e.UpdatedAt = time.Now()
	f.events[e.ID] = e
	return nil
}

// Delete removes an event
func (f *fakeRepo) Delete(ctx context.Context, id uuid.UUID) error {
	if _, ok := f.events[id]; !ok {
		return ErrNotFound
	}
	delete(f.events, id)
	return nil
}

// GetCategoryByID returns the category with the given ID
func (f *fakeRepo) GetCategoryByID(ctx context.Context, id uuid.UUID) (*EventCategory, error) {
	c, ok := f.categories[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *c
	return &cp, nil
}

// listCategories fetches all categories for an event
func (f *fakeRepo) listCategories(ctx context.Context, eventID uuid.UUID) ([]EventCategory, error) {
	var out []EventCategory
	for _, c := range f.categories {
		if c.EventID == eventID {
			out = append(out, *c)
		}
	}
	return out, nil
}

// listSchedule fetches all schedule items for an event
func (f *fakeRepo) listSchedule(ctx context.Context, eventID uuid.UUID) ([]EventSchedule, error) {
	return nil, nil
}

// CreateCategory inserts a new category for an event
func (f *fakeRepo) CreateCategory(ctx context.Context, c *EventCategory) error {
	if _, ok := f.events[c.EventID]; !ok {
		return ErrNotFound
	}
	c.ID = uuid.New()
	c.Status = "OPEN"
	f.categories[c.ID] = c
	return nil
}

// UpdateCategory updates a category
func (f *fakeRepo) UpdateCategory(ctx context.Context, id uuid.UUID, p *UpdateCategoryRequest) (*EventCategory, error) {
	c, ok := f.categories[id]
	if !ok {
		return nil, ErrNotFound
	}
	if p.Name != nil {
		c.Name = *p.Name
	}
	if p.Distance != nil {
		c.Distance = *p.Distance
	}
	if p.PriceCents != nil {
		c.PriceCents = *p.PriceCents
	}
	if p.Capacity != nil {
		c.Capacity = *p.Capacity
	}
	if p.Status != nil {
		c.Status = *p.Status
	}
	if p.RegistrationDeadline != nil {
		c.RegistrationDeadline = p.RegistrationDeadline
	}
	cp := *c
	return &cp, nil
}

// DeleteCategory removes a category
func (f *fakeRepo) DeleteCategory(ctx context.Context, id uuid.UUID) error {
	if _, ok := f.categories[id]; !ok {
		return ErrNotFound
	}
	delete(f.categories, id)
	return nil
}

// CreateScheduleItem inserts a new schedule item
func (f *fakeRepo) CreateScheduleItem(ctx context.Context, s *EventSchedule) error {
	s.ID = uuid.New()
	f.schedule[s.ID] = s
	return nil
}

// UpdateScheduleItem updates a schedule item
func (f *fakeRepo) UpdateScheduleItem(ctx context.Context, id uuid.UUID, p *UpdateScheduleRequest) (*EventSchedule, error) {
	s, ok := f.schedule[id]
	if !ok {
		return nil, ErrNotFound
	}
	if p.Title != nil {
		s.Title = *p.Title
	}
	if p.Description != nil {
		s.Description = *p.Description
	}
	if p.SortOrder != nil {
		s.SortOrder = *p.SortOrder
	}
	cp := *s
	return &cp, nil
}

// DeleteScheduleItem removes a schedule item
func (f *fakeRepo) DeleteScheduleItem(ctx context.Context, id uuid.UUID) error {
	if _, ok := f.schedule[id]; !ok {
		return ErrNotFound
	}
	delete(f.schedule, id)
	return nil
}

// validCreateReq creates a valid create event request
func validCreateReq(name string) CreateEventRequest {
	return CreateEventRequest{
		Name:      name,
		EventDate: "2025-12-06",
		StartTime: "06:00",
	}
}

// TestService_Create_GeneratesSlugFromName tests the Create method that generates a slug from the name
func TestService_Create_GeneratesSlugFromName(t *testing.T) {
	svc := NewService(newFakeRepo(), nil)

	e, err := svc.Create(context.Background(), validCreateReq("Unity Founders Run 2025"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if e.Slug != "unity-founders-run-2025" {
		t.Errorf("Slug = %q, want %q", e.Slug, "unity-founders-run-2025")
	}
	if e.Status != StatusDraft {
		t.Errorf("Status = %q, want %q", e.Status, StatusDraft)
	}
}

// TestService_Create_DuplicateSlugRejected tests the Create method that rejects a duplicate slug
func TestService_Create_DuplicateSlugRejected(t *testing.T) {
	svc := NewService(newFakeRepo(), nil)
	ctx := context.Background()

	req := validCreateReq("Founders Run")
	req.Slug = "founders-run"
	if _, err := svc.Create(ctx, req); err != nil {
		t.Fatalf("first Create() error = %v", err)
	}

	_, err := svc.Create(ctx, req)
	if !errors.Is(err, ErrSlugTaken) {
		t.Fatalf("second Create() error = %v, want ErrSlugTaken", err)
	}
}

// TestService_Create_RequiresCompleteMapPin tests the Create method that requires a complete map pin
func TestService_Create_RequiresCompleteMapPin(t *testing.T) {
	svc := NewService(newFakeRepo(), nil)
	req := validCreateReq("Incomplete map pin")
	latitude := 11.5564
	req.Latitude = &latitude

	if _, err := svc.Create(context.Background(), req); !errors.Is(err, ErrInvalidCoordinates) {
		t.Fatalf("Create() error = %v, want ErrInvalidCoordinates", err)
	}
}

// TestService_Update_CanRemoveMapPin tests the Update method that can remove a map pin
func TestService_Update_CanRemoveMapPin(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	latitude, longitude := 11.5564, 104.9282
	req := validCreateReq("Mapped run")
	req.Latitude, req.Longitude = &latitude, &longitude
	e, err := svc.Create(context.Background(), req)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	updated, err := svc.Update(context.Background(), e.ID, UpdateEventRequest{ClearCoordinates: true})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if updated.Latitude != nil || updated.Longitude != nil {
		t.Fatalf("coordinates = %v,%v, want both nil", updated.Latitude, updated.Longitude)
	}
}

// TestService_Update_StatusTransition tests the Update method that can transition the status
func TestService_Update_StatusTransition(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	ctx := context.Background()

	e, err := svc.Create(ctx, validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	published := StatusPublished
	updated, err := svc.Update(ctx, e.ID, UpdateEventRequest{Status: &published})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if updated.Status != StatusPublished {
		t.Errorf("Status = %q, want %q", updated.Status, StatusPublished)
	}
}

// TestService_Update_InvalidStatusTransitionRejected tests the Update method that rejects an invalid status transition
func TestService_Update_InvalidStatusTransitionRejected(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	ctx := context.Background()

	e, err := svc.Create(ctx, validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	// DRAFT -> COMPLETED is not an allowed transition.
	completed := StatusCompleted
	_, err = svc.Update(ctx, e.ID, UpdateEventRequest{Status: &completed})
	if !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("Update() error = %v, want ErrInvalidTransition", err)
	}
}

// TestService_Delete_OnlyAllowedWhileDraft tests the Delete method that only allows deletion while the event is draft
func TestService_Delete_OnlyAllowedWhileDraft(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	ctx := context.Background()

	e, err := svc.Create(ctx, validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	published := StatusPublished
	if _, err := svc.Update(ctx, e.ID, UpdateEventRequest{Status: &published}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	if err := svc.Delete(ctx, e.ID); !errors.Is(err, ErrDeleteNotAllowed) {
		t.Fatalf("Delete() error = %v, want ErrDeleteNotAllowed", err)
	}
}

// TestService_Delete_AllowedWhileDraft tests the Delete method that allows deletion while the event is draft
func TestService_Delete_AllowedWhileDraft(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	ctx := context.Background()

	e, err := svc.Create(ctx, validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if err := svc.Delete(ctx, e.ID); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}

	if _, err := repo.GetByID(ctx, e.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("event should have been deleted, GetByID error = %v", err)
	}
}

// TestService_GetDetailBySlug_HidesNonPublicStatusFromPublic tests the GetDetailBySlug method that hides non-public status from public
func TestService_GetDetailBySlug_HidesNonPublicStatusFromPublic(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	ctx := context.Background()

	e, err := svc.Create(ctx, validCreateReq("Founders Run")) // starts DRAFT
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if _, err := svc.GetDetailBySlug(ctx, e.Slug, false); !errors.Is(err, ErrNotFound) {
		t.Fatalf("public GetDetailBySlug() error = %v, want ErrNotFound", err)
	}

	if _, err := svc.GetDetailBySlug(ctx, e.Slug, true); err != nil {
		t.Fatalf("admin GetDetailBySlug() error = %v, want nil", err)
	}
}

// TestService_List_PublicFilterCannotIncludeDraft tests the List method that cannot include draft in the public filter
func TestService_List_PublicFilterCannotIncludeDraft(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	filter := &ListFilter{Statuses: []Status{StatusDraft, StatusRegistrationOpen}}

	if _, _, err := svc.List(context.Background(), filter, false); err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(repo.lastFilter.Statuses) != 1 || repo.lastFilter.Statuses[0] != StatusRegistrationOpen {
		t.Fatalf("effective statuses = %v, want only REGISTRATION_OPEN", repo.lastFilter.Statuses)
	}
}

// TestService_CreateCategory_PersistsRegistrationDeadline tests the CreateCategory method that persists the registration deadline
func TestService_CreateCategory_PersistsRegistrationDeadline(t *testing.T) {
	repo := newFakeRepo()
	event := &Event{ID: uuid.New()}
	repo.events[event.ID] = event
	svc := NewService(repo, nil)
	deadline := time.Now().Add(24 * time.Hour).UTC().Truncate(time.Second)

	category, err := svc.CreateCategory(context.Background(), event.ID, CreateCategoryRequest{
		Name: "10K", Distance: "10K", Capacity: 50, RegistrationDeadline: &deadline,
	})
	if err != nil {
		t.Fatalf("CreateCategory() error = %v", err)
	}
	if category.RegistrationDeadline == nil || !category.RegistrationDeadline.Equal(deadline) {
		t.Fatalf("RegistrationDeadline = %v, want %v", category.RegistrationDeadline, deadline)
	}
}

// TestSlugify tests the slugify function
func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Unity Founders Run 2025": "unity-founders-run-2025",
		"  Extra   Spaces  ":      "extra-spaces",
		"Café & Run!":             "caf-run",
	}
	for input, want := range cases {
		if got := slugify(input); got != want {
			t.Errorf("slugify(%q) = %q, want %q", input, got, want)
		}
	}
}

// fakeEventNotifier records which notify calls fired
type fakeEventNotifier struct {
	updated       []Event
	updatedFields [][]string
	cancelled     []Event
}

// NotifyEventUpdated records the updated event and changed fields
func (f *fakeEventNotifier) NotifyEventUpdated(ctx context.Context, ev Event, changedFields []string) {
	f.updated = append(f.updated, ev)
	f.updatedFields = append(f.updatedFields, changedFields)
}

// NotifyEventCancelled records the cancelled event
func (f *fakeEventNotifier) NotifyEventCancelled(ctx context.Context, ev Event) {
	f.cancelled = append(f.cancelled, ev)
}

// TestService_Update_NotifiesOnDateChange tests the Update method that notifies on date change
func TestService_Update_NotifiesOnDateChange(t *testing.T) {
	repo := newFakeRepo()
	notifier := &fakeEventNotifier{}
	svc := NewService(repo, notifier)
	ctx := context.Background()

	e, err := svc.Create(ctx, validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	newDate := "2026-06-01"
	if _, err := svc.Update(ctx, e.ID, UpdateEventRequest{EventDate: &newDate}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	if len(notifier.updated) != 1 {
		t.Fatalf("updated notifications = %d, want 1", len(notifier.updated))
	}
	if len(notifier.cancelled) != 0 {
		t.Errorf("cancelled notifications = %d, want 0", len(notifier.cancelled))
	}
	if len(notifier.updatedFields[0]) == 0 {
		t.Error("expected changed fields to be non-empty")
	}
}

// TestService_Update_NoNotificationForUnrelatedFieldChange tests the Update method that does not notify for unrelated field change
func TestService_Update_NoNotificationForUnrelatedFieldChange(t *testing.T) {
	repo := newFakeRepo()
	notifier := &fakeEventNotifier{}
	svc := NewService(repo, notifier)
	ctx := context.Background()

	e, err := svc.Create(ctx, validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	newDescription := "Updated description text"
	if _, err := svc.Update(ctx, e.ID, UpdateEventRequest{Description: &newDescription}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	if len(notifier.updated) != 0 {
		t.Errorf("updated notifications = %d, want 0 (description isn't a notify-worthy field)", len(notifier.updated))
	}
}

// TestService_Update_NotifiesCancellationNotUpdate tests the Update method that notifies cancellation instead of update
func TestService_Update_NotifiesCancellationNotUpdate(t *testing.T) {
	repo := newFakeRepo()
	notifier := &fakeEventNotifier{}
	svc := NewService(repo, notifier)
	ctx := context.Background()

	e, err := svc.Create(ctx, validCreateReq("Founders Run")) // starts DRAFT
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	cancelled := StatusCancelled
	if _, err := svc.Update(ctx, e.ID, UpdateEventRequest{Status: &cancelled}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	if len(notifier.cancelled) != 1 {
		t.Errorf("cancelled notifications = %d, want 1", len(notifier.cancelled))
	}
	if len(notifier.updated) != 0 {
		t.Errorf("updated notifications = %d, want 0 (cancellation takes priority)", len(notifier.updated))
	}
}

func TestService_Update_NilNotifierIsSafe(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	ctx := context.Background()

	e, err := svc.Create(ctx, validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	newDate := "2026-06-01"
	if _, err := svc.Update(ctx, e.ID, UpdateEventRequest{EventDate: &newDate}); err != nil {
		t.Fatalf("Update() with nil notifier error = %v, want nil", err)
	}
}
