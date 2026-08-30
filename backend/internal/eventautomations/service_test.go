package eventautomations

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

type fakeRepository struct {
	created   *Automation
	updated   *Automation
	cancelled uuid.UUID
	updateErr error
}

func (f *fakeRepository) List(context.Context, uuid.UUID) ([]Automation, error) { return nil, nil }
func (f *fakeRepository) Create(_ context.Context, a *Automation) error {
	a.ID = uuid.New()
	f.created = a
	return nil
}
func (f *fakeRepository) Update(_ context.Context, eventID, id uuid.UUID, name, message string, sendAt *time.Time, status Status) (*Automation, error) {
	if f.updateErr != nil {
		return nil, f.updateErr
	}
	f.updated = &Automation{ID: id, EventID: eventID, Name: name, Message: message, SendAt: sendAt, Status: status}
	return f.updated, nil
}
func (f *fakeRepository) Cancel(_ context.Context, _ uuid.UUID, id uuid.UUID) error {
	f.cancelled = id
	return nil
}

func TestCreateDraftAndSchedule(t *testing.T) {
	repo := &fakeRepository{}
	svc := NewService(repo)
	eventID, actorID := uuid.New(), uuid.New()
	draft, err := svc.Create(context.Background(), eventID, actorID, UpsertRequest{Name: "  Course note  ", Message: "  Bring water.  "})
	if err != nil || draft.Status != StatusDraft || draft.Name != "Course note" || draft.Message != "Bring water." {
		t.Fatalf("draft = %#v, err = %v", draft, err)
	}
	sendAt := time.Now().Add(time.Hour)
	scheduled, err := svc.Create(context.Background(), eventID, actorID, UpsertRequest{Name: "Start time", Message: "Start at six.", SendAt: &sendAt})
	if err != nil || scheduled.Status != StatusScheduled || scheduled.SendAt == nil {
		t.Fatalf("scheduled = %#v, err = %v", scheduled, err)
	}
}

func TestUpdateCanScheduleDraftAndRetryFailure(t *testing.T) {
	repo := &fakeRepository{}
	svc := NewService(repo)
	eventID, id := uuid.New(), uuid.New()
	sendAt := time.Now().Add(time.Hour)
	updated, err := svc.Update(context.Background(), eventID, id, UpsertRequest{Name: "Weather", Message: "Race remains open.", SendAt: &sendAt})
	if err != nil || updated.Status != StatusScheduled || repo.updated.ID != id {
		t.Fatalf("updated = %#v, err = %v", updated, err)
	}
	repo.updateErr = ErrImmutable
	if _, err = svc.Update(context.Background(), eventID, id, UpsertRequest{Name: "Weather", Message: "Race remains open.", SendAt: &sendAt}); !errors.Is(err, ErrImmutable) {
		t.Fatalf("immutable update err = %v", err)
	}
}

func TestValidationRejectsPastOrBlankTransmission(t *testing.T) {
	svc := NewService(&fakeRepository{})
	past := time.Now().Add(-2 * time.Minute)
	for _, req := range []UpsertRequest{{Name: "", Message: "Message"}, {Name: "Title", Message: ""}, {Name: "Title", Message: "Message", SendAt: &past}} {
		if _, err := svc.Create(context.Background(), uuid.New(), uuid.New(), req); !errors.Is(err, ErrValidation) {
			t.Fatalf("Create(%#v) err = %v, want ErrValidation", req, err)
		}
	}
}
