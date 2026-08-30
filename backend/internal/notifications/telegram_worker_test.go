package notifications

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/email"
)

type fakeTelegramDeliveryRepo struct {
	notification *Notification
	delivery     Delivery
	nextAttempt  time.Time
}

func (f *fakeTelegramDeliveryRepo) GetByID(context.Context, uuid.UUID) (*Notification, error) {
	if f.notification == nil {
		return nil, ErrNotFound
	}
	copy := *f.notification
	return &copy, nil
}
func (f *fakeTelegramDeliveryRepo) ClaimTelegramDeliveries(context.Context, int) ([]Delivery, error) {
	if f.delivery.Status != DeliveryPending || (!f.nextAttempt.IsZero() && f.nextAttempt.After(time.Now())) {
		return nil, nil
	}
	f.delivery.Status = DeliveryProcessing
	return []Delivery{f.delivery}, nil
}
func (f *fakeTelegramDeliveryRepo) MarkDeliverySent(_ context.Context, _ uuid.UUID, sentAt time.Time) error {
	f.delivery.Status, f.delivery.SentAt = DeliverySent, &sentAt
	return nil
}
func (f *fakeTelegramDeliveryRepo) MarkDeliverySkipped(context.Context, uuid.UUID) error {
	f.delivery.Status = DeliverySkipped
	return nil
}
func (f *fakeTelegramDeliveryRepo) RecordDeliveryFailure(_ context.Context, _ uuid.UUID, message string, maxAttempts int) error {
	f.delivery.Attempts++
	f.delivery.LastError = message
	if f.delivery.Attempts >= maxAttempts {
		f.delivery.Status = DeliveryFailed
	} else {
		f.delivery.Status = DeliveryPending
		f.nextAttempt = time.Now().Add(time.Minute)
	}
	return nil
}

type fakeDurableTelegramSender struct {
	delivered bool
	err       error
	calls     int
}

func (f *fakeDurableTelegramSender) SendNotification(context.Context, uuid.UUID, string, email.TemplateData) (bool, error) {
	f.calls++
	return f.delivered, f.err
}

func TestTelegramWorkerRetriesThenMarksSent(t *testing.T) {
	emailWorker, _, _, regID := setup()
	userID := uuid.New()
	notificationID := uuid.New()
	repo := &fakeTelegramDeliveryRepo{
		notification: &Notification{ID: notificationID, UserID: &userID, Type: TypeRegistrationConfirmation,
			EntityType: "registration", EntityID: regID, RecipientEmail: "runner@example.com", Payload: map[string]any{}},
		delivery: Delivery{ID: uuid.New(), NotificationID: notificationID, UserID: userID, Status: DeliveryPending},
	}
	sender := &fakeDurableTelegramSender{err: errors.New("temporary Telegram outage")}
	worker := NewTelegramWorker(repo, emailWorker.regs, emailWorker.evts, sender, discardLogger(), time.Hour, 3, "http://localhost:3000")

	worker.sweep(context.Background())
	if repo.delivery.Status != DeliveryPending || repo.delivery.Attempts != 1 {
		t.Fatalf("after failure delivery = %#v", repo.delivery)
	}

	sender.err, sender.delivered = nil, true
	repo.nextAttempt = time.Time{}
	worker.sweep(context.Background())
	if repo.delivery.Status != DeliverySent || repo.delivery.SentAt == nil {
		t.Fatalf("after retry delivery = %#v", repo.delivery)
	}
	if sender.calls != 2 {
		t.Fatalf("sender calls = %d, want 2", sender.calls)
	}
}

func TestTelegramWorkerMarksOptedOutDeliverySkipped(t *testing.T) {
	emailWorker, _, _, regID := setup()
	userID := uuid.New()
	notificationID := uuid.New()
	repo := &fakeTelegramDeliveryRepo{
		notification: &Notification{ID: notificationID, UserID: &userID, Type: TypeEventReminder,
			EntityType: "registration", EntityID: regID, RecipientEmail: "runner@example.com", Payload: map[string]any{}},
		delivery: Delivery{ID: uuid.New(), NotificationID: notificationID, UserID: userID, Status: DeliveryPending},
	}
	sender := &fakeDurableTelegramSender{delivered: false}
	worker := NewTelegramWorker(repo, emailWorker.regs, emailWorker.evts, sender, discardLogger(), time.Hour, 3, "http://localhost:3000")

	worker.sweep(context.Background())
	if repo.delivery.Status != DeliverySkipped {
		t.Fatalf("delivery status = %s, want SKIPPED", repo.delivery.Status)
	}
}
