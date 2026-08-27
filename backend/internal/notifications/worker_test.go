package notifications

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/email"
	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/registrations"
)

// fakeWorkerRepo is an in-memory workerRepository for worker unit tests.
type fakeWorkerRepo struct {
	byID map[uuid.UUID]*Notification
}

func newFakeWorkerRepo() *fakeWorkerRepo {
	return &fakeWorkerRepo{byID: map[uuid.UUID]*Notification{}}
}

func (f *fakeWorkerRepo) GetByID(ctx context.Context, id uuid.UUID) (*Notification, error) {
	n, ok := f.byID[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *n
	return &cp, nil
}

func (f *fakeWorkerRepo) MarkSent(ctx context.Context, id uuid.UUID, sentAt time.Time) error {
	n, ok := f.byID[id]
	if !ok {
		return ErrNotFound
	}
	n.Status = StatusSent
	n.SentAt = &sentAt
	return nil
}

func (f *fakeWorkerRepo) RecordFailure(ctx context.Context, id uuid.UUID, errMsg string, maxAttempts int) error {
	n, ok := f.byID[id]
	if !ok {
		return ErrNotFound
	}
	n.Attempts++
	n.LastError = errMsg
	if n.Attempts >= maxAttempts {
		n.Status = StatusFailed
	}
	return nil
}

func (f *fakeWorkerRepo) ListPendingOlderThan(ctx context.Context, cutoff time.Time, limit int) ([]Notification, error) {
	var out []Notification
	for _, n := range f.byID {
		if n.Status == StatusPending && n.CreatedAt.Before(cutoff) {
			out = append(out, *n)
		}
	}
	return out, nil
}

func (f *fakeWorkerRepo) seed(n Notification) {
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	if n.Status == "" {
		n.Status = StatusPending
	}
	f.byID[n.ID] = &n
}

// fakeRegGetter/fakeEvtGetter back the worker's template-data lookups.
type fakeRegGetter struct {
	byID     map[uuid.UUID]*registrations.Registration
	payments map[uuid.UUID]*registrations.Payment
}

func (f *fakeRegGetter) GetPaymentForRegistration(ctx context.Context, id uuid.UUID) (*registrations.Payment, error) {
	p, ok := f.payments[id]
	if !ok {
		return nil, registrations.ErrNotFound
	}
	return p, nil
}

func (f *fakeRegGetter) GetByID(ctx context.Context, id uuid.UUID) (*registrations.Registration, error) {
	r, ok := f.byID[id]
	if !ok {
		return nil, registrations.ErrNotFound
	}
	return r, nil
}

type fakeEvtGetter struct {
	events     map[uuid.UUID]*events.Event
	categories map[uuid.UUID]*events.EventCategory
}

func (f *fakeEvtGetter) GetByID(ctx context.Context, id uuid.UUID) (*events.Event, error) {
	e, ok := f.events[id]
	if !ok {
		return nil, events.ErrNotFound
	}
	return e, nil
}

func (f *fakeEvtGetter) GetCategoryByID(ctx context.Context, id uuid.UUID) (*events.EventCategory, error) {
	c, ok := f.categories[id]
	if !ok {
		return nil, events.ErrNotFound
	}
	return c, nil
}

type fakeSender struct {
	sent []email.Message
	err  error
}

type fakeWorkerQueue struct {
	heartbeats chan struct{}
}

func (f *fakeWorkerQueue) pop(ctx context.Context, timeout time.Duration) (string, error) {
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-time.After(time.Millisecond):
		return "", nil
	}
}

func (f *fakeWorkerQueue) heartbeat(context.Context, time.Duration) error {
	select {
	case f.heartbeats <- struct{}{}:
	default:
	}
	return nil
}

func (f *fakeSender) Send(ctx context.Context, msg email.Message) error {
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, msg)
	return nil
}

func setup() (*Worker, *fakeWorkerRepo, *fakeSender, uuid.UUID) {
	regID := uuid.New()
	eventID := uuid.New()
	categoryID := uuid.New()

	verifiedAt := time.Date(2026, 8, 24, 15, 42, 0, 0, time.UTC)
	regRepo := &fakeRegGetter{byID: map[uuid.UUID]*registrations.Registration{
		regID: {
			ID: regID, EventID: eventID, EventCategoryID: categoryID,
			FullName: "Test Runner", Email: "runner@unityrunclub.com", RegistrationNumber: "URC-2026-000001", TshirtSize: "M",
		},
	}, payments: map[uuid.UUID]*registrations.Payment{regID: {
		RegistrationID: regID, Provider: "bakong", ProviderReference: "KHQR-001",
		AmountCents: 2500, Currency: "USD", Status: "PAID", VerifiedAt: &verifiedAt,
	}}}
	evtRepo := &fakeEvtGetter{
		events:     map[uuid.UUID]*events.Event{eventID: {ID: eventID, Name: "Founders Run", Location: "Diamond Island"}},
		categories: map[uuid.UUID]*events.EventCategory{categoryID: {ID: categoryID, Name: "5K"}},
	}

	notifRepo := newFakeWorkerRepo()
	sender := &fakeSender{}
	w := NewWorker(notifRepo, nil, regRepo, evtRepo, sender, discardLogger(), time.Hour, 3)
	return w, notifRepo, sender, regID
}

func TestWorker_Process_SuccessMarksSent(t *testing.T) {
	w, notifRepo, sender, regID := setup()

	n := Notification{Type: TypeRegistrationConfirmation, EntityType: "registration", EntityID: regID,
		RecipientEmail: "runner@unityrunclub.com", Payload: map[string]any{}}
	notifRepo.seed(n)
	var id uuid.UUID
	for k := range notifRepo.byID {
		id = k
	}

	w.process(context.Background(), id.String())

	if len(sender.sent) != 1 {
		t.Fatalf("sent = %d, want 1", len(sender.sent))
	}
	if len(sender.sent[0].Attachments) != 1 {
		t.Fatalf("attachments = %d, want ticket PDF", len(sender.sent[0].Attachments))
	}
	if notifRepo.byID[id].Status != StatusSent {
		t.Errorf("Status = %q, want %q", notifRepo.byID[id].Status, StatusSent)
	}
}

func TestWorker_RunPublishesHeartbeatImmediately(t *testing.T) {
	w, _, _, _ := setup()
	queue := &fakeWorkerQueue{heartbeats: make(chan struct{}, 1)}
	w.queue = queue
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		w.Run(ctx)
		close(done)
	}()

	select {
	case <-queue.heartbeats:
		cancel()
	case <-time.After(250 * time.Millisecond):
		cancel()
		t.Fatal("worker did not publish its startup heartbeat")
	}
	<-done
}

func TestWorker_Process_PaymentConfirmationAttachesVerifiedReceipt(t *testing.T) {
	w, notifRepo, sender, regID := setup()
	n := Notification{Type: TypePaymentConfirmation, EntityType: "registration", EntityID: regID,
		RecipientEmail: "runner@unityrunclub.com", Payload: map[string]any{"amount_cents": float64(2500)}}
	notifRepo.seed(n)
	var id uuid.UUID
	for candidate := range notifRepo.byID {
		id = candidate
	}

	w.process(context.Background(), id.String())

	if len(sender.sent) != 1 {
		t.Fatalf("sent = %d, want 1", len(sender.sent))
	}
	if len(sender.sent[0].Attachments) != 1 || sender.sent[0].Attachments[0].ContentType != "application/pdf" {
		t.Fatal("payment confirmation should contain one PDF receipt")
	}
	if !strings.Contains(sender.sent[0].HTML, "$25.00 USD") {
		t.Error("payment email should use the persisted payment amount")
	}
}

func TestWorker_Process_FailureStaysPendingUnderMaxAttempts(t *testing.T) {
	w, notifRepo, sender, regID := setup()
	sender.err = errors.New("smtp: connection refused")

	n := Notification{Type: TypeRegistrationConfirmation, EntityType: "registration", EntityID: regID,
		RecipientEmail: "runner@unityrunclub.com", Payload: map[string]any{}}
	notifRepo.seed(n)
	var id uuid.UUID
	for k := range notifRepo.byID {
		id = k
	}

	w.process(context.Background(), id.String())

	if notifRepo.byID[id].Status != StatusPending {
		t.Errorf("Status = %q, want %q (attempts=%d < max)", notifRepo.byID[id].Status, StatusPending, notifRepo.byID[id].Attempts)
	}
	if notifRepo.byID[id].Attempts != 1 {
		t.Errorf("Attempts = %d, want 1", notifRepo.byID[id].Attempts)
	}
}

func TestWorker_Process_FailurePastMaxAttemptsMarksFailed(t *testing.T) {
	w, notifRepo, sender, regID := setup()
	sender.err = errors.New("smtp: connection refused")

	n := Notification{Type: TypeRegistrationConfirmation, EntityType: "registration", EntityID: regID,
		RecipientEmail: "runner@unityrunclub.com", Payload: map[string]any{}, Attempts: 2}
	notifRepo.seed(n)
	var id uuid.UUID
	for k := range notifRepo.byID {
		id = k
	}

	w.process(context.Background(), id.String()) // 3rd attempt, maxAttempts=3

	if notifRepo.byID[id].Status != StatusFailed {
		t.Errorf("Status = %q, want %q", notifRepo.byID[id].Status, StatusFailed)
	}
}

func TestWorker_Process_SkipsAlreadySent(t *testing.T) {
	w, notifRepo, sender, regID := setup()

	n := Notification{Type: TypeRegistrationConfirmation, EntityType: "registration", EntityID: regID,
		RecipientEmail: "runner@unityrunclub.com", Payload: map[string]any{}, Status: StatusSent}
	notifRepo.seed(n)
	var id uuid.UUID
	for k := range notifRepo.byID {
		id = k
	}

	w.process(context.Background(), id.String())

	if len(sender.sent) != 0 {
		t.Errorf("expected no send for an already-SENT notification, got %d", len(sender.sent))
	}
}
