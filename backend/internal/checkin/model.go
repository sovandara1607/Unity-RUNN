// Package checkin implements event-day QR check-in: resolving a
// scanned ticket token to a registration, validating it, and
// recording a check-in exactly once.
package checkin

import (
	"time"

	"github.com/google/uuid"
)

// CheckIn is a recorded check-in for one registration.
type CheckIn struct {
	ID             uuid.UUID `json:"id"`
	RegistrationID uuid.UUID `json:"registration_id"`
	StaffUserID    uuid.UUID `json:"staff_user_id"`
	CheckedInAt    time.Time `json:"checked_in_at"`
	CreatedAt      time.Time `json:"created_at"`
}
