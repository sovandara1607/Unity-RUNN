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
	TypeEventAnnouncement        Type = "EVENT_ANNOUNCEMENT"
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

type DeliveryStatus string

const (
	DeliveryPending    DeliveryStatus = "PENDING"
	DeliveryProcessing DeliveryStatus = "PROCESSING"
	DeliverySent       DeliveryStatus = "SENT"
	DeliverySkipped    DeliveryStatus = "SKIPPED"
	DeliveryFailed     DeliveryStatus = "FAILED"
)

// Delivery is a durable channel-specific attempt for one notification.
type Delivery struct {
	ID             uuid.UUID      `json:"id"`
	NotificationID uuid.UUID      `json:"-"`
	UserID         uuid.UUID      `json:"-"`
	Channel        string         `json:"channel"`
	Status         DeliveryStatus `json:"status"`
	Type           Type           `json:"type"`
	EntityID       uuid.UUID      `json:"entity_id"`
	Attempts       int            `json:"attempts"`
	LastError      string         `json:"-"`
	CreatedAt      time.Time      `json:"created_at"`
	SentAt         *time.Time     `json:"sent_at,omitempty"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

type AutomationCounts struct {
	Total   int `json:"total"`
	Sent    int `json:"sent"`
	Pending int `json:"pending"`
	Failed  int `json:"failed"`
	Skipped int `json:"skipped"`
}

type AutomationPreferences struct {
	Tickets      int `json:"tickets"`
	Reminders    int `json:"reminders"`
	EventUpdates int `json:"event_updates"`
}

type AdminDelivery struct {
	ID             uuid.UUID      `json:"id"`
	Status         DeliveryStatus `json:"status"`
	Type           Type           `json:"type"`
	EntityID       uuid.UUID      `json:"entity_id"`
	RunnerName     string         `json:"runner_name"`
	RecipientEmail string         `json:"recipient_email"`
	Attempts       int            `json:"attempts"`
	FailureReason  string         `json:"failure_reason,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	SentAt         *time.Time     `json:"sent_at,omitempty"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

type AutomationSnapshot struct {
	Configured       bool                  `json:"configured"`
	GeneratedAt      time.Time             `json:"generated_at"`
	WindowDays       int                   `json:"window_days"`
	ConnectedRunners int                   `json:"connected_runners"`
	Preferences      AutomationPreferences `json:"preferences"`
	Counts           AutomationCounts      `json:"counts"`
	SuccessRate      float64               `json:"success_rate"`
	ByType           map[Type]int          `json:"by_type"`
	Recent           []AdminDelivery       `json:"recent"`
}
