// Package registrations implements the Registration domain: creating
// a capacity-safe registration for an event category, cancellation,
// payment (via internal/payments.Provider), and QR ticket issuance.
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

// activeStatuses count toward a category's capacity and toward the
// one-registration-per-user-per-event rule.
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
	ID                uuid.UUID  `json:"id"`
	RegistrationID    uuid.UUID  `json:"registration_id"`
	Provider          string     `json:"provider"`
	ProviderReference string     `json:"provider_reference"`
	AmountCents       int        `json:"amount_cents"`
	Currency          string     `json:"currency"`
	Status            string     `json:"status"`
	CheckoutPayload   string     `json:"-"`
	ExpiresAt         *time.Time `json:"expires_at,omitempty"`
	VerifiedAt        *time.Time `json:"verified_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// Ticket is the QR ticket issued for a confirmed registration. The
// raw token is never persisted — only TokenHash — so it's returned to
// the caller exactly once, at issuance time.
type Ticket struct {
	ID             uuid.UUID `json:"id"`
	RegistrationID uuid.UUID `json:"registration_id"`
	TokenHash      string    `json:"-"`
	IssuedAt       time.Time `json:"issued_at"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ParticipantInfo is the participant-facing data captured at
// registration time (a snapshot — not a live join to profiles).
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
