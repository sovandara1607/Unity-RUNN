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

// Notification is one queued/sent email.
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
