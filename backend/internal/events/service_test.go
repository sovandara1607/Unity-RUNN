package events

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

// fakeRepo is an in-memory eventRepository for service unit tests.
type fakeRepo struct {
	events map[uuid.UUID]*Event
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{events: map[uuid.UUID]*Event{}}
}

func (f *fakeRepo) List(ctx context.Context, filter ListFilter) ([]Event, int, error) {
	var out []Event
	for _, e := range f.events {
		out = append(out, *e)
	}
	return out, len(out), nil
}

func (f *fakeRepo) GetByID(ctx context.Context, id uuid.UUID) (*Event, error) {
	e, ok := f.events[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *e
	return &cp, nil
}

func (f *fakeRepo) GetDetailBySlug(ctx context.Context, slug string) (*EventDetail, error) {
	for _, e := range f.events {
		if e.Slug == slug {
			return &EventDetail{Event: *e}, nil
		}
	}
	return nil, ErrNotFound
}

func (f *fakeRepo) SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	for _, e := range f.events {
		if e.Slug == slug && (excludeID == nil || e.ID != *excludeID) {
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeRepo) Create(ctx context.Context, e *Event) error {
	e.ID = uuid.New()
	e.CreatedAt = time.Now()
	e.UpdatedAt = time.Now()
	f.events[e.ID] = e
	return nil
}

func (f *fakeRepo) Update(ctx context.Context, e *Event) error {
	if _, ok := f.events[e.ID]; !ok {
		return ErrNotFound
	}
	e.UpdatedAt = time.Now()
	f.events[e.ID] = e
	return nil
}

func (f *fakeRepo) Delete(ctx context.Context, id uuid.UUID) error {
	if _, ok := f.events[id]; !ok {
		return ErrNotFound
	}
	delete(f.events, id)
	return nil
}

func validCreateReq(name string) CreateEventRequest {
	return CreateEventRequest{
		Name:      name,
		EventDate: "2025-12-06",
		StartTime: "06:00",
	}
}

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

// fakeEventNotifier records which notify calls fired.
type fakeEventNotifier struct {
	updated       []Event
	updatedFields [][]string
	cancelled     []Event
}

func (f *fakeEventNotifier) NotifyEventUpdated(ctx context.Context, ev Event, changedFields []string) {
	f.updated = append(f.updated, ev)
	f.updatedFields = append(f.updatedFields, changedFields)
}

func (f *fakeEventNotifier) NotifyEventCancelled(ctx context.Context, ev Event) {
	f.cancelled = append(f.cancelled, ev)
}

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
