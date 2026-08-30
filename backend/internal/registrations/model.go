package registrations

import (
	"time"

	"github.com/google/uuid"
)

// Status is a registration's lifecycle state.
type Status string

const (
	StatusPending   Status = "PENDING"
	StatusConfirmed Status = "CONFIRMED"
	StatusCancelled Status = "CANCELLED"
	StatusRefunded  Status = "REFUNDED"
)

var activeStatuses = map[Status]bool{
	StatusPending:   true,
	StatusConfirmed: true,
}

// IsActive reports whether s counts toward capacity/uniqueness.
func (s Status) IsActive() bool {
	return activeStatuses[s]
}

// Registration is a runner's registration for one event category.
type Registration struct {
	ID                    uuid.UUID  `json:"id"`
	RegistrationNumber    string     `json:"registration_number"`
	UserID                uuid.UUID  `json:"user_id"`
	EventID               uuid.UUID  `json:"event_id"`
	EventCategoryID       uuid.UUID  `json:"event_category_id"`
	EventName             string     `json:"event_name,omitempty"`
	CategoryName          string     `json:"category_name,omitempty"`
	Status                Status     `json:"status"`
	FullName              string     `json:"full_name"`
	Email                 string     `json:"email"`
	Phone                 string     `json:"phone"`
	DateOfBirth           *time.Time `json:"date_of_birth"`
	Gender                string     `json:"gender"`
	EmergencyContactName  string     `json:"emergency_contact_name"`
	EmergencyContactPhone string     `json:"emergency_contact_phone"`
	TshirtSize            string     `json:"tshirt_size"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
	CheckedInAt           *time.Time `json:"checked_in_at,omitempty"`
}

// Payment records a payment attempt for a registration.
type Payment struct {
	ID                  uuid.UUID  `json:"id"`
	RegistrationID      uuid.UUID  `json:"registration_id"`
	Provider            string     `json:"provider"`
	ProviderReference   string     `json:"provider_reference"`
	AmountCents         int        `json:"amount_cents"`
	Currency            string     `json:"currency"`
	Status              string     `json:"status"`
	CheckoutPayload     string     `json:"-"`
	ExpiresAt           *time.Time `json:"expires_at,omitempty"`
	VerifiedAt          *time.Time `json:"verified_at,omitempty"`
	ReconcileAfter      time.Time  `json:"-"`
	ReconcileLeaseUntil *time.Time `json:"-"`
	ReconcileWorkerID   string     `json:"-"`
	LastCheckedAt       *time.Time `json:"last_checked_at,omitempty"`
	ReconcileAttempts   int        `json:"reconcile_attempts"`
	ReconcileError      string     `json:"-"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type Ticket struct {
	ID             uuid.UUID `json:"id"`
	RegistrationID uuid.UUID `json:"registration_id"`
	TokenHash      string    `json:"-"`
	IssuedAt       time.Time `json:"issued_at"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type ParticipantInfo struct {
	FullName              string
	Email                 string
	Phone                 string
	DateOfBirth           *time.Time
	Gender                string
	EmergencyContactName  string
	EmergencyContactPhone string
	TshirtSize            string
}

// Availability is the capacity snapshot for one event category.
type Availability struct {
	Capacity  int `json:"capacity"`
	Taken     int `json:"taken"`
	Available int `json:"available"`
}
