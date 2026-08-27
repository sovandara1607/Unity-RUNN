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
type pusher interface {
	push(ctx context.Context, notificationID string) error
}

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
		if err != ErrAlreadyExists {
			s.log.Error("notification_create_failed", "error", err, "type", p.Type, "entity_id", p.EntityID)
		}
		return
	}

	if err := s.queue.push(ctx, n.ID.String()); err != nil {
		s.log.Warn("notification_queue_push_failed", "error", err, "notification_id", n.ID)
	}
}
