package eventautomations

import (
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusDraft      Status = "DRAFT"
	StatusScheduled  Status = "SCHEDULED"
	StatusProcessing Status = "PROCESSING"
	StatusSent       Status = "SENT"
	StatusFailed     Status = "FAILED"
	StatusCancelled  Status = "CANCELLED"
)

type Automation struct {
	ID        uuid.UUID  `json:"id"`
	EventID   uuid.UUID  `json:"event_id"`
	Name      string     `json:"name"`
	Message   string     `json:"message"`
	SendAt    *time.Time `json:"send_at,omitempty"`
	Status    Status     `json:"status"`
	SentCount int        `json:"sent_count"`
	Attempts  int        `json:"attempts"`
	LastError string     `json:"last_error,omitempty"`
	CreatedBy *uuid.UUID `json:"created_by,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	SentAt    *time.Time `json:"sent_at,omitempty"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type UpsertRequest struct {
	Name    string     `json:"name"`
	Message string     `json:"message"`
	SendAt  *time.Time `json:"send_at"`
}
