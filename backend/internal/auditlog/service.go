package auditlog

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
)

// writer is the subset of Repository the service depends on.
type writer interface {
	Insert(ctx context.Context, e *Entry) error
}

// Service records audit log entries. Failures to write are logged
// but never propagated — an audit-log outage must not block the
// underlying action (e.g. a check-in) from succeeding.
type Service struct {
	repo writer
	log  *slog.Logger
}

// NewService builds a Service backed by repo.
func NewService(repo writer, log *slog.Logger) *Service {
	return &Service{repo: repo, log: log}
}

// Record writes an audit log entry. actorID is nil for system-initiated
// actions. entityID is nil when the action isn't tied to one entity.
func (s *Service) Record(ctx context.Context, actorID *uuid.UUID, action, entityType string, entityID *uuid.UUID, metadata map[string]any) {
	entry := &Entry{
		ActorID: actorID, Action: action, EntityType: entityType, EntityID: entityID, Metadata: metadata,
	}
	if err := s.repo.Insert(ctx, entry); err != nil {
		s.log.Error("audit_log_write_failed", "error", err, "action", action, "entity_type", entityType)
	}
}
