package notifications

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/registrations"
)

type fakeEventLister struct {
	events []events.Event
}

func (f *fakeEventLister) List(ctx context.Context, filter events.ListFilter) ([]events.Event, int, error) {
	return f.events, len(f.events), nil
}

type fakeRegLister struct {
	byEvent map[uuid.UUID][]registrations.Registration
}

func (f *fakeRegLister) ListAll(ctx context.Context, filter registrations.AdminListFilter) ([]registrations.Registration, int, error) {
	if filter.EventID == nil {
		return nil, 0, nil
	}
	regs := f.byEvent[*filter.EventID]
	return regs, len(regs), nil
}

func TestReminderScheduler_OnlySendsForInWindowEvents(t *testing.T) {
	now := time.Now()
	inWindowEvent := events.Event{ID: uuid.New(), Name: "Soon", Status: events.StatusRegistrationOpen, EventDate: now.Add(12 * time.Hour)}
	tooFarEvent := events.Event{ID: uuid.New(), Name: "Later", Status: events.StatusRegistrationOpen, EventDate: now.Add(72 * time.Hour)}
	pastEvent := events.Event{ID: uuid.New(), Name: "Past", Status: events.StatusCompleted, EventDate: now.Add(-24 * time.Hour)}

	regID := uuid.New()
	regLister := &fakeRegLister{byEvent: map[uuid.UUID][]registrations.Registration{
		inWindowEvent.ID: {{ID: regID, UserID: uuid.New(), EventID: inWindowEvent.ID, Email: "runner@unityrunclub.com", Status: registrations.StatusConfirmed}},
		tooFarEvent.ID:   {{ID: uuid.New(), UserID: uuid.New(), EventID: tooFarEvent.ID, Email: "other@unityrunclub.com", Status: registrations.StatusConfirmed}},
	}}
	eventLister := &fakeEventLister{events: []events.Event{inWindowEvent, tooFarEvent, pastEvent}}

	repo := &fakeCreator{}
	queue := &fakePusher{}
	svc := NewService(repo, queue, discardLogger())
	scheduler := NewReminderScheduler(svc, eventLister, regLister, discardLogger(), time.Minute, 24*time.Hour)

	scheduler.pollOnce(context.Background())

	if len(repo.created) != 1 {
		t.Fatalf("created = %d, want 1 (only the in-window event's registrant)", len(repo.created))
	}
	if repo.created[0].EntityID != regID {
		t.Errorf("EntityID = %v, want %v", repo.created[0].EntityID, regID)
	}
	if repo.created[0].Type != TypeEventReminder {
		t.Errorf("Type = %q, want %q", repo.created[0].Type, TypeEventReminder)
	}
}

func TestReminderScheduler_SecondPollDoesNotDuplicate(t *testing.T) {
	now := time.Now()
	ev := events.Event{ID: uuid.New(), Name: "Soon", Status: events.StatusRegistrationOpen, EventDate: now.Add(12 * time.Hour)}
	regID := uuid.New()
	regLister := &fakeRegLister{byEvent: map[uuid.UUID][]registrations.Registration{
		ev.ID: {{ID: regID, UserID: uuid.New(), EventID: ev.ID, Email: "runner@unityrunclub.com", Status: registrations.StatusConfirmed}},
	}}
	eventLister := &fakeEventLister{events: []events.Event{ev}}
	// dedupCreator 
	repo := &dedupCreator{seen: map[string]bool{}}
	queue := &fakePusher{}
	svc := NewService(repo, queue, discardLogger())
	scheduler := NewReminderScheduler(svc, eventLister, regLister, discardLogger(), time.Minute, 24*time.Hour)

	scheduler.pollOnce(context.Background())
	scheduler.pollOnce(context.Background())

	if repo.createCount != 1 {
		t.Errorf("createCount = %d, want 1 (second poll should be deduped)", repo.createCount)
	}
}

// dedupCreator mimics the notifications table's unique index on
// (type, entity_type, entity_id).
type dedupCreator struct {
	seen        map[string]bool
	createCount int
}

func (d *dedupCreator) Create(ctx context.Context, n *Notification) error {
	key := string(n.Type) + "|" + n.EntityType + "|" + n.EntityID.String()
	if d.seen[key] {
		return ErrAlreadyExists
	}
	d.seen[key] = true
	d.createCount++
	n.ID = uuid.New()
	return nil
}
