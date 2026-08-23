package notifications

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
)

// enqueueParams bundles a single notification's fields.
type enqueueParams struct {
	UserID         *uuid.UUID
	RecipientEmail string
	Type           Type
	EntityType     string
	EntityID       uuid.UUID
	Payload        map[string]any
}

// creator is the subset of Repository Service depends on for enqueue.
type creator interface {
	Create(ctx context.Context, n *Notification) error
}

// pusher is the subset of Queue Service depends on — an interface
// (rather than *Queue directly) so unit tests can inject a fake
// without a real Redis connection.
type pusher interface {
	push(ctx context.Context, notificationID string) error
}

// Service is the write side of the notification pipeline: persist +
// queue. Enqueue never returns an error to callers — a notification
// failure must never fail the registration/event action that
// triggered it (same fire-and-forget contract as
// internal/auditlog.Service.Record).
type Service struct {
	repo  creator
	queue pusher
	log   *slog.Logger
}

// NewService builds a Service backed by repo and a Redis queue.
func NewService(repo creator, q pusher, log *slog.Logger) *Service {
	return &Service{repo: repo, queue: q, log: log}
}

func (s *Service) enqueue(ctx context.Context, p enqueueParams) {
	n := &Notification{
		UserID: p.UserID, RecipientEmail: p.RecipientEmail, Type: p.Type,
		EntityType: p.EntityType, EntityID: p.EntityID, Payload: p.Payload,
	}

	if err := s.repo.Create(ctx, n); err != nil {
		// ErrAlreadyExists is expected/benign (dedup working as
		// intended, e.g. reminder scheduler racing itself) — anything
		// else is a real failure, logged but not propagated.
		if err != ErrAlreadyExists {
			s.log.Error("notification_create_failed", "error", err, "type", p.Type, "entity_id", p.EntityID)
		}
		return
	}

	if err := s.queue.push(ctx, n.ID.String()); err != nil {
		// Not fatal — the worker's periodic sweep will pick this row
		// up from Postgres even if the Redis push failed.
		s.log.Warn("notification_queue_push_failed", "error", err, "notification_id", n.ID)
	}
}
