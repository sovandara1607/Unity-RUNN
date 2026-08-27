package notifications

import (
	"context"
	"log/slog"

	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/registrations"
)

type registrationLister interface {
	ListAll(ctx context.Context, filter registrations.AdminListFilter) ([]registrations.Registration, int, error)
}

type EventNotifier struct {
	svc  *Service
	regs registrationLister
	log  *slog.Logger
}

// NewEventNotifier builds an EventNotifier backed by svc/regs.
func NewEventNotifier(svc *Service, regs registrationLister, log *slog.Logger) *EventNotifier {
	return &EventNotifier{svc: svc, regs: regs, log: log}
}

func (n *EventNotifier) NotifyEventUpdated(ctx context.Context, ev events.Event, changedFields []string) {
	n.fanOut(ctx, ev, TypeEventUpdate, map[string]any{"changed_fields": changedFields})
}

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
