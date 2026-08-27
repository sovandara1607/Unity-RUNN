package auditlog

import (
	"time"

	"github.com/google/uuid"
)

// Entry is one audit log record
type Entry struct {
	ID         uuid.UUID      `json:"id"`
	ActorID    *uuid.UUID     `json:"actor_id"`
	Action     string         `json:"action"`
	EntityType string         `json:"entity_type"`
	EntityID   *uuid.UUID     `json:"entity_id"`
	Metadata   map[string]any `json:"metadata"`
	CreatedAt  time.Time      `json:"created_at"`
}
