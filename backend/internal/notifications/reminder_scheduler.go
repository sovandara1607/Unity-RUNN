package notifications

import (
	"context"
	"log/slog"
	"time"

	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/registrations"
)

// reminderEventLister is the read-only slice this package needs to
// find events due for a reminder. Must be wired to
// *events.Repository, not events.Service — same page-size-clamp
// reasoning as registrationLister in event_notifier.go.
type reminderEventLister interface {
	List(ctx context.Context, filter events.ListFilter) ([]events.Event, int, error)
}

// remindableStatuses are the event statuses worth reminding
// registrants about — excludes DRAFT (not public yet), CANCELLED/
// ARCHIVED (nothing to remind about), and COMPLETED (already happened).
var remindableStatuses = []events.Status{
	events.StatusPublished, events.StatusRegistrationOpen, events.StatusRegistrationClosed,
}

// ReminderScheduler periodically finds events happening soon and
// enqueues an EVENT_REMINDER for each confirmed registrant who
// doesn't already have one. Idempotent by construction: the
// notifications unique index (type, entity_type, entity_id) means a
// second poll tick, or two overlapping ticks, never double-sends.
type ReminderScheduler struct {
	svc          *Service
	events       reminderEventLister
	regs         registrationLister
	log          *slog.Logger
	pollInterval time.Duration
	window       time.Duration
}

// NewReminderScheduler builds a ReminderScheduler.
func NewReminderScheduler(svc *Service, eventsRepo reminderEventLister, regsRepo registrationLister,
	log *slog.Logger, pollInterval, window time.Duration) *ReminderScheduler {
	return &ReminderScheduler{
		svc: svc, events: eventsRepo, regs: regsRepo, log: log,
		pollInterval: pollInterval, window: window,
	}
}

// Run blocks, polling every pollInterval, until ctx is cancelled.
func (s *ReminderScheduler) Run(ctx context.Context) {
	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.pollOnce(ctx)
		}
	}
}

func (s *ReminderScheduler) pollOnce(ctx context.Context) {
	evts, _, err := s.events.List(ctx, events.ListFilter{Statuses: remindableStatuses, Limit: 1000})
	if err != nil {
		s.log.Error("reminder_scheduler_list_events_failed", "error", err)
		return
	}

	now := time.Now()
	deadline := now.Add(s.window)

	for _, ev := range evts {
		if ev.EventDate.Before(now) || ev.EventDate.After(deadline) {
			continue
		}
		s.remindRegistrants(ctx, ev)
	}
}

func (s *ReminderScheduler) remindRegistrants(ctx context.Context, ev events.Event) {
	status := registrations.StatusConfirmed
	regs, _, err := s.regs.ListAll(ctx, registrations.AdminListFilter{
		EventID: &ev.ID, Status: &status, Limit: 10000,
	})
	if err != nil {
		s.log.Error("reminder_scheduler_list_registrations_failed", "error", err, "event_id", ev.ID)
		return
	}

	for _, reg := range regs {
		s.svc.enqueue(ctx, enqueueParams{
			UserID: &reg.UserID, RecipientEmail: reg.Email, Type: TypeEventReminder,
			EntityType: "registration", EntityID: reg.ID, Payload: registrationPayload(reg),
		})
	}
}
