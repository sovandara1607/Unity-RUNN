// Package notifications is the async email pipeline: every email is
// first persisted as a Notification row (Postgres-authoritative),
// then queued in Redis for a worker to pick up and send. See
// internal/email for rendering/transport.
package notifications

import (
	"time"

	"github.com/google/uuid"
)

// Type identifies what kind of notification this is.
type Type string

const (
	TypeRegistrationConfirmation Type = "REGISTRATION_CONFIRMATION"
	TypePaymentConfirmation      Type = "PAYMENT_CONFIRMATION"
	TypeEventReminder            Type = "EVENT_REMINDER"
	TypeEventUpdate              Type = "EVENT_UPDATE"
	TypeCancellation             Type = "CANCELLATION"
)

// Status is a notification's delivery state.
type Status string

const (
	StatusPending Status = "PENDING"
	StatusSent    Status = "SENT"
	StatusFailed  Status = "FAILED"
)

// Notification is one queued/sent email. Every notification points
// at the registration it concerns (entity_type is always
// "registration" in practice — even event-level broadcasts resolve
// to one row per affected registration at enqueue time, see
// Service.NotifyEventUpdated/NotifyEventCancelled) — this is what
// lets a single (type, entity_type, entity_id) unique constraint
// dedup every notification type, including fan-out ones.
type Notification struct {
	ID             uuid.UUID
	UserID         *uuid.UUID
	RecipientEmail string
	Type           Type
	EntityType     string
	EntityID       uuid.UUID
	Payload        map[string]any
	Status         Status
	Attempts       int
	LastError      string
	CreatedAt      time.Time
	SentAt         *time.Time
	UpdatedAt      time.Time
}
