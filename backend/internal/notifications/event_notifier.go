package notifications

import (
	"context"
	"log/slog"

	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/registrations"
)

// registrationLister is the slice this package needs to fan out
// event-level notifications to every confirmed registrant. Must be
// wired to *registrations.Repository, NOT registrations.Service —
// the Service clamps Limit to its admin-API page size (100), which
// would silently drop registrants past the first page for a
// large/popular event. The repository performs no such clamping.
type registrationLister interface {
	ListAll(ctx context.Context, filter registrations.AdminListFilter) ([]registrations.Registration, int, error)
}

// EventNotifier adapts Service to events.EventNotifier (interface
// defined in internal/events/service.go). Fans out one notification
// per confirmed registration for the event — there's no "broadcast"
// notification type; NotifyEventUpdated/NotifyEventCancelled just
// call Service.enqueue once per registrant, reusing the exact same
// dedup/delivery path as every other notification.
type EventNotifier struct {
	svc  *Service
	regs registrationLister
	log  *slog.Logger
}

// NewEventNotifier builds an EventNotifier backed by svc/regs.
func NewEventNotifier(svc *Service, regs registrationLister, log *slog.Logger) *EventNotifier {
	return &EventNotifier{svc: svc, regs: regs, log: log}
}

// NotifyEventUpdated enqueues an event-update email to every
// confirmed registrant of ev.
func (n *EventNotifier) NotifyEventUpdated(ctx context.Context, ev events.Event, changedFields []string) {
	n.fanOut(ctx, ev, TypeEventUpdate, map[string]any{"changed_fields": changedFields})
}

// NotifyEventCancelled enqueues a cancellation email to every
// confirmed registrant of ev.
func (n *EventNotifier) NotifyEventCancelled(ctx context.Context, ev events.Event) {
	n.fanOut(ctx, ev, TypeCancellation, nil)
}

func (n *EventNotifier) fanOut(ctx context.Context, ev events.Event, typ Type, extraPayload map[string]any) {
	status := registrations.StatusConfirmed
	regs, _, err := n.regs.ListAll(ctx, registrations.AdminListFilter{
		EventID: &ev.ID, Status: &status, Limit: 10000,
	})
	if err != nil {
		n.log.Error("event_notification_fanout_list_failed", "error", err, "event_id", ev.ID)
		return
	}

	for _, reg := range regs {
		payload := registrationPayload(reg)
		for k, v := range extraPayload {
			payload[k] = v
		}
		n.svc.enqueue(ctx, enqueueParams{
			UserID: &reg.UserID, RecipientEmail: reg.Email, Type: typ,
			EntityType: "registration", EntityID: reg.ID, Payload: payload,
		})
	}
}
