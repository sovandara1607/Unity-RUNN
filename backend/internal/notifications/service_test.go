package notifications

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
)

type fakeCreator struct {
	created []Notification
	err     error
}

func (f *fakeCreator) Create(ctx context.Context, n *Notification) error {
	if f.err != nil {
		return f.err
	}
	n.ID = uuid.New()
	n.CreatedAt = time.Now()
	n.UpdatedAt = time.Now()
	f.created = append(f.created, *n)
	return nil
}

type fakePusher struct {
	pushed []string
	err    error
}

func (f *fakePusher) push(ctx context.Context, notificationID string) error {
	if f.err != nil {
		return f.err
	}
	f.pushed = append(f.pushed, notificationID)
	return nil
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestService_Enqueue_CreatesRowAndPushes(t *testing.T) {
	repo := &fakeCreator{}
	queue := &fakePusher{}
	svc := NewService(repo, queue, discardLogger())

	userID := uuid.New()
	entityID := uuid.New()
	svc.enqueue(context.Background(), enqueueParams{
		UserID: &userID, RecipientEmail: "runner@unityrunclub.com", Type: TypeRegistrationConfirmation,
		EntityType: "registration", EntityID: entityID, Payload: map[string]any{"foo": "bar"},
	})

	if len(repo.created) != 1 {
		t.Fatalf("created = %d, want 1", len(repo.created))
	}
	if repo.created[0].RecipientEmail != "runner@unityrunclub.com" {
		t.Errorf("RecipientEmail = %q, unexpected", repo.created[0].RecipientEmail)
	}
	if len(queue.pushed) != 1 {
		t.Fatalf("pushed = %d, want 1", len(queue.pushed))
	}
	if queue.pushed[0] != repo.created[0].ID.String() {
		t.Errorf("pushed ID = %q, want %q", queue.pushed[0], repo.created[0].ID.String())
	}
}

func TestService_Enqueue_AlreadyExistsIsSilent(t *testing.T) {
	repo := &fakeCreator{err: ErrAlreadyExists}
	queue := &fakePusher{}
	svc := NewService(repo, queue, discardLogger())

	userID := uuid.New()
	svc.enqueue(context.Background(), enqueueParams{
		UserID: &userID, RecipientEmail: "runner@unityrunclub.com", Type: TypeEventReminder,
		EntityType: "registration", EntityID: uuid.New(),
	})

	if len(queue.pushed) != 0 {
		t.Errorf("expected no queue push on ErrAlreadyExists, got %d", len(queue.pushed))
	}
}

func TestService_Enqueue_CreateFailureDoesNotPanic(t *testing.T) {
	repo := &fakeCreator{err: context.DeadlineExceeded}
	queue := &fakePusher{}
	svc := NewService(repo, queue, discardLogger())

	userID := uuid.New()
	// Should log and return, not panic — a create failure here must
	// never bubble up to the caller (registrations/events service).
	svc.enqueue(context.Background(), enqueueParams{
		UserID: &userID, RecipientEmail: "runner@unityrunclub.com", Type: TypeCancellation,
		EntityType: "registration", EntityID: uuid.New(),
	})

	if len(queue.pushed) != 0 {
		t.Errorf("expected no queue push on create failure, got %d", len(queue.pushed))
	}
}

func TestService_Enqueue_QueuePushFailureDoesNotPanic(t *testing.T) {
	repo := &fakeCreator{}
	queue := &fakePusher{err: context.DeadlineExceeded}
	svc := NewService(repo, queue, discardLogger())

	userID := uuid.New()
	// Should log and return — the sweep will pick this row up later.
	svc.enqueue(context.Background(), enqueueParams{
		UserID: &userID, RecipientEmail: "runner@unityrunclub.com", Type: TypePaymentConfirmation,
		EntityType: "registration", EntityID: uuid.New(),
	})

	if len(repo.created) != 1 {
		t.Errorf("expected the row to still be created despite queue push failure, got %d", len(repo.created))
	}
}
