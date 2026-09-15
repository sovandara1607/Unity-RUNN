package liveactivities

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// fakeRepo is an in-memory repository double, matching the pattern used by
// registrations.fakeRepo -- lets the service layer's actual logic (ownership
// checks live in the handler, but duplicate-prevention delegation and the
// domain-event mapping live here) be tested without a live Postgres.
type fakeRepo struct {
	byID map[uuid.UUID]*LiveActivity
	// active tracks (userID, eventID) pairs with a currently-ACTIVE row, to
	// reproduce the partial unique index's behavior without a real database.
	active map[[2]uuid.UUID]uuid.UUID
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{byID: map[uuid.UUID]*LiveActivity{}, active: map[[2]uuid.UUID]uuid.UUID{}}
}

func (f *fakeRepo) Create(_ context.Context, userID uuid.UUID, in CreateInput) (*LiveActivity, error) {
	key := [2]uuid.UUID{userID, in.EventID}
	if _, exists := f.active[key]; exists {
		return nil, ErrDuplicateActive
	}
	a := &LiveActivity{
		ID: uuid.New(), UserID: userID, EventID: in.EventID, RegistrationID: in.RegistrationID,
		ActivityID: in.ActivityID, DeviceID: in.DeviceID, PushToken: in.PushToken, Platform: in.Platform,
		Status: StatusActive, RaceStatus: RaceUpcoming,
	}
	f.byID[a.ID] = a
	f.active[key] = a.ID
	return a, nil
}

func (f *fakeRepo) GetByID(_ context.Context, id uuid.UUID) (*LiveActivity, error) {
	a, ok := f.byID[id]
	if !ok {
		return nil, ErrNotFound
	}
	copyA := *a
	return &copyA, nil
}

func (f *fakeRepo) ListActiveForUser(_ context.Context, userID uuid.UUID) ([]LiveActivity, error) {
	out := []LiveActivity{}
	for _, a := range f.byID {
		if a.UserID == userID && a.Status == StatusActive {
			out = append(out, *a)
		}
	}
	return out, nil
}

func (f *fakeRepo) UpdateRaceStatus(_ context.Context, id uuid.UUID, in UpdateInput) (*LiveActivity, error) {
	a, ok := f.byID[id]
	if !ok || a.Status != StatusActive {
		return nil, ErrNotFound
	}
	if in.RaceStatus != nil {
		a.RaceStatus = *in.RaceStatus
	}
	if in.PushToken != nil {
		a.PushToken = *in.PushToken
	}
	copyA := *a
	return &copyA, nil
}

func (f *fakeRepo) End(_ context.Context, id uuid.UUID) error {
	a, ok := f.byID[id]
	if !ok || a.Status != StatusActive {
		return nil // idempotent, matches Repository.End
	}
	a.Status = StatusEnded
	delete(f.active, [2]uuid.UUID{a.UserID, a.EventID})
	return nil
}

// recordingPublisher captures every Publish call instead of sending anything,
// so tests can assert which domain event a status transition produced.
type recordingPublisher struct {
	calls []DomainEvent
}

func (p *recordingPublisher) Publish(_ context.Context, _ *LiveActivity, event DomainEvent) error {
	p.calls = append(p.calls, event)
	return nil
}

func TestService_Start_CreatesActiveActivity(t *testing.T) {
	svc := NewService(newFakeRepo(), nil)
	userID, eventID := uuid.New(), uuid.New()

	a, err := svc.Start(context.Background(), userID, CreateInput{
		EventID: eventID, ActivityID: "activity-1", PushToken: "token-1", Platform: "ios",
	})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if a.Status != StatusActive || a.RaceStatus != RaceUpcoming {
		t.Fatalf("expected ACTIVE/UPCOMING, got %s/%s", a.Status, a.RaceStatus)
	}
}

func TestService_Start_PreventsDuplicateActive(t *testing.T) {
	svc := NewService(newFakeRepo(), nil)
	userID, eventID := uuid.New(), uuid.New()
	in := CreateInput{EventID: eventID, ActivityID: "activity-1", PushToken: "token-1", Platform: "ios"}

	if _, err := svc.Start(context.Background(), userID, in); err != nil {
		t.Fatalf("first Start: %v", err)
	}
	_, err := svc.Start(context.Background(), userID, in)
	if !errors.Is(err, ErrDuplicateActive) {
		t.Fatalf("expected ErrDuplicateActive, got %v", err)
	}
}

func TestService_Start_SameUserDifferentEvent_NotADuplicate(t *testing.T) {
	svc := NewService(newFakeRepo(), nil)
	userID := uuid.New()

	if _, err := svc.Start(context.Background(), userID, CreateInput{
		EventID: uuid.New(), ActivityID: "a1", PushToken: "t1", Platform: "ios",
	}); err != nil {
		t.Fatalf("first event: %v", err)
	}
	if _, err := svc.Start(context.Background(), userID, CreateInput{
		EventID: uuid.New(), ActivityID: "a2", PushToken: "t2", Platform: "ios",
	}); err != nil {
		t.Fatalf("second event should not collide: %v", err)
	}
}

func TestService_Update_TransitionsStatusAndPublishesMappedEvent(t *testing.T) {
	publisher := &recordingPublisher{}
	svc := NewService(newFakeRepo(), publisher)
	userID, eventID := uuid.New(), uuid.New()
	a, err := svc.Start(context.Background(), userID, CreateInput{
		EventID: eventID, ActivityID: "a1", PushToken: "t1", Platform: "ios",
	})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	cases := []struct {
		to      RaceStatus
		wantEvt DomainEvent
	}{
		{RaceCheckIn, EventCheckInOpened},
		{RaceStarting, EventStartingSoon},
		{RaceLive, EventRaceProgress},
		{RaceFinished, EventRunnerFinished},
	}
	for _, c := range cases {
		status := c.to
		updated, err := svc.Update(context.Background(), a.ID, UpdateInput{RaceStatus: &status})
		if err != nil {
			t.Fatalf("Update to %s: %v", c.to, err)
		}
		if updated.RaceStatus != c.to {
			t.Fatalf("expected race_status %s, got %s", c.to, updated.RaceStatus)
		}
	}
	if len(publisher.calls) != len(cases) {
		t.Fatalf("expected %d publish calls, got %d", len(cases), len(publisher.calls))
	}
	for i, c := range cases {
		if publisher.calls[i] != c.wantEvt {
			t.Errorf("transition %d: expected event %s, got %s", i, c.wantEvt, publisher.calls[i])
		}
	}
}

func TestService_Update_UnknownActivity_ReturnsNotFound(t *testing.T) {
	svc := NewService(newFakeRepo(), nil)
	status := RaceLive
	_, err := svc.Update(context.Background(), uuid.New(), UpdateInput{RaceStatus: &status})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestService_End_IsIdempotent(t *testing.T) {
	svc := NewService(newFakeRepo(), nil)
	userID, eventID := uuid.New(), uuid.New()
	a, err := svc.Start(context.Background(), userID, CreateInput{
		EventID: eventID, ActivityID: "a1", PushToken: "t1", Platform: "ios",
	})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := svc.End(context.Background(), a.ID); err != nil {
		t.Fatalf("first End: %v", err)
	}
	if err := svc.End(context.Background(), a.ID); err != nil {
		t.Fatalf("second End should be a no-op success, got: %v", err)
	}
	if err := svc.End(context.Background(), uuid.New()); err != nil {
		t.Fatalf("ending a never-existed id should also be a no-op success, got: %v", err)
	}
}

func TestService_End_ThenStart_AllowsRefollowing(t *testing.T) {
	// A runner can stop following and start again -- ending doesn't
	// permanently block the (user, event) pair the way an unconditional
	// unique constraint would.
	svc := NewService(newFakeRepo(), nil)
	userID, eventID := uuid.New(), uuid.New()
	in := CreateInput{EventID: eventID, ActivityID: "a1", PushToken: "t1", Platform: "ios"}

	first, err := svc.Start(context.Background(), userID, in)
	if err != nil {
		t.Fatalf("first Start: %v", err)
	}
	if err := svc.End(context.Background(), first.ID); err != nil {
		t.Fatalf("End: %v", err)
	}
	if _, err := svc.Start(context.Background(), userID, in); err != nil {
		t.Fatalf("re-following after End should succeed, got: %v", err)
	}
}

func TestService_GetActiveForUser_OnlyReturnsThatUsersActiveRows(t *testing.T) {
	svc := NewService(newFakeRepo(), nil)
	userA, userB := uuid.New(), uuid.New()
	if _, err := svc.Start(context.Background(), userA, CreateInput{
		EventID: uuid.New(), ActivityID: "a1", PushToken: "t1", Platform: "ios",
	}); err != nil {
		t.Fatalf("Start userA: %v", err)
	}
	if _, err := svc.Start(context.Background(), userB, CreateInput{
		EventID: uuid.New(), ActivityID: "a2", PushToken: "t2", Platform: "ios",
	}); err != nil {
		t.Fatalf("Start userB: %v", err)
	}
	got, err := svc.GetActiveForUser(context.Background(), userA)
	if err != nil {
		t.Fatalf("GetActiveForUser: %v", err)
	}
	if len(got) != 1 || got[0].UserID != userA {
		t.Fatalf("expected exactly userA's one activity, got %+v", got)
	}
}

func TestDefaultPublisher_NeverErrors(t *testing.T) {
	// The default (unconfigured) publisher must never fail a request --
	// see the package doc comment: the app must keep working without a
	// real APNs integration.
	p := DefaultPublisher{}
	a := &LiveActivity{ID: uuid.New()}
	if err := p.Publish(context.Background(), a, EventRaceProgress); err != nil {
		t.Fatalf("DefaultPublisher.Publish should never error, got: %v", err)
	}
}
