package notifications

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/email"
	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/registrations"
)

// workerRepository is the subset of Repository the worker depends on.
type workerRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*Notification, error)
	MarkSent(ctx context.Context, id uuid.UUID, sentAt time.Time) error
	RecordFailure(ctx context.Context, id uuid.UUID, errMsg string, maxAttempts int) error
	ListPendingOlderThan(ctx context.Context, cutoff time.Time, limit int) ([]Notification, error)
}

// registrationGetter is the read-only slice of registrations the
// worker needs to enrich a notification's template data.
type registrationGetter interface {
	GetByID(ctx context.Context, id uuid.UUID) (*registrations.Registration, error)
}

// eventGetter is the read-only slice of events the worker needs.
type eventGetter interface {
	GetByID(ctx context.Context, id uuid.UUID) (*events.Event, error)
	GetCategoryByID(ctx context.Context, id uuid.UUID) (*events.EventCategory, error)
}

// Worker drains the Redis queue and, as a durability backstop, sweeps
// Postgres for any PENDING row the queue missed. Postgres remains
// authoritative — the queue only helps the worker notice new work
// quickly; a lost queue message never loses the email; it's just
// picked up on the next sweep.
type Worker struct {
	repo          workerRepository
	queue         *Queue
	regs          registrationGetter
	evts          eventGetter
	sender        email.Sender
	log           *slog.Logger
	sweepInterval time.Duration
	sweepAge      time.Duration
	maxAttempts   int
}

// NewWorker builds a Worker.
func NewWorker(repo workerRepository, q *Queue, regs registrationGetter, evts eventGetter,
	sender email.Sender, log *slog.Logger, sweepInterval time.Duration, maxAttempts int) *Worker {
	return &Worker{
		repo: repo, queue: q, regs: regs, evts: evts, sender: sender, log: log,
		sweepInterval: sweepInterval, sweepAge: 5 * time.Second, maxAttempts: maxAttempts,
	}
}

// Run blocks, draining the queue and periodically sweeping, until ctx
// is cancelled.
func (w *Worker) Run(ctx context.Context) {
	sweepTicker := time.NewTicker(w.sweepInterval)
	defer sweepTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-sweepTicker.C:
			w.sweep(ctx)
		default:
			id, err := w.queue.pop(ctx, 2*time.Second)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				w.log.Error("notification_queue_pop_failed", "error", err)
				continue
			}
			if id == "" {
				continue // timeout, nothing queued — loop back to select
			}
			w.process(ctx, id)
		}
	}
}

func (w *Worker) sweep(ctx context.Context) {
	cutoff := time.Now().Add(-w.sweepAge)
	pending, err := w.repo.ListPendingOlderThan(ctx, cutoff, 100)
	if err != nil {
		w.log.Error("notification_sweep_failed", "error", err)
		return
	}
	for _, n := range pending {
		w.process(ctx, n.ID.String())
	}
}

func (w *Worker) process(ctx context.Context, notificationID string) {
	id, err := uuid.Parse(notificationID)
	if err != nil {
		w.log.Error("notification_invalid_id", "id", notificationID, "error", err)
		return
	}

	n, err := w.repo.GetByID(ctx, id)
	if errors.Is(err, ErrNotFound) {
		return // already handled/removed
	}
	if err != nil {
		w.log.Error("notification_load_failed", "id", id, "error", err)
		return
	}
	if n.Status != StatusPending {
		return // already sent or failed-out; sweep/queue can race harmlessly
	}

	if err := w.send(ctx, n); err != nil {
		w.log.Warn("notification_send_failed", "id", id, "type", n.Type, "error", err)
		if failErr := w.repo.RecordFailure(ctx, id, err.Error(), w.maxAttempts); failErr != nil {
			w.log.Error("notification_record_failure_failed", "id", id, "error", failErr)
		}
		return
	}

	if err := w.repo.MarkSent(ctx, id, time.Now()); err != nil {
		w.log.Error("notification_mark_sent_failed", "id", id, "error", err)
	}
}

func (w *Worker) send(ctx context.Context, n *Notification) error {
	data, recipient, err := w.buildTemplateData(ctx, n)
	if err != nil {
		return fmt.Errorf("build template data: %w", err)
	}

	subject, html, text, err := email.Render(email.Type(n.Type), data)
	if err != nil {
		return fmt.Errorf("render: %w", err)
	}

	return w.sender.Send(ctx, email.Message{To: recipient, Subject: subject, HTML: html, Text: text})
}

func (w *Worker) buildTemplateData(ctx context.Context, n *Notification) (email.TemplateData, string, error) {
	reg, err := w.regs.GetByID(ctx, n.EntityID)
	if err != nil {
		return email.TemplateData{}, "", fmt.Errorf("load registration: %w", err)
	}

	ev, err := w.evts.GetByID(ctx, reg.EventID)
	if err != nil {
		return email.TemplateData{}, "", fmt.Errorf("load event: %w", err)
	}

	category, err := w.evts.GetCategoryByID(ctx, reg.EventCategoryID)
	if err != nil {
		return email.TemplateData{}, "", fmt.Errorf("load category: %w", err)
	}

	data := email.TemplateData{
		FullName:           reg.FullName,
		EventName:          ev.Name,
		CategoryName:       category.Name,
		RegistrationNumber: reg.RegistrationNumber,
		EventDate:          ev.EventDate.Format("Monday, January 2, 2006"),
		Location:           ev.Location,
	}

	if amountCents, ok := n.Payload["amount_cents"].(float64); ok {
		data.AmountFormatted = fmt.Sprintf("$%.2f", amountCents/100)
	}
	if changed, ok := n.Payload["changed_fields"].([]any); ok {
		data.ChangedFields = joinAny(changed)
	}

	return data, n.RecipientEmail, nil
}

func joinAny(items []any) string {
	out := ""
	for i, item := range items {
		if i > 0 {
			out += ", "
		}
		out += fmt.Sprintf("%v", item)
	}
	return out
}
