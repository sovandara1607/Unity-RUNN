// Package liveactivities backs iOS Live Activities / Dynamic Island for a
// runner following a race. This package owns only the backend contract:
// who is following which event, and the APNs push token to reach their
// activity. Sending the actual APNs "push-to-update" request is deliberately
// NOT implemented here yet -- see Publisher in service.go -- because that
// requires real Apple Developer push credentials this repository does not
// have. Wire a real Publisher once those exist; until then PublishDefault
// logs and no-ops, and the mobile app must keep working without it.
package liveactivities

import (
	"time"

	"github.com/google/uuid"
)

// Status is the backend-side lifecycle of the follow relationship itself
// (do we still have a live channel to this device), distinct from RaceStatus
// (where the race is). A row moves ACTIVE -> ENDED (runner stopped following,
// or the race finished and we closed it out) or ACTIVE -> EXPIRED (the APNs
// token aged out without ever being explicitly ended).
type Status string

const (
	StatusActive  Status = "ACTIVE"
	StatusEnded   Status = "ENDED"
	StatusExpired Status = "EXPIRED"
)

// RaceStatus mirrors the mobile RaceLiveActivityState exactly (see
// mobile/services/liveActivity/types.ts) -- this is the state actually shown
// on the Lock Screen / Dynamic Island, not the follow-relationship status
// above.
type RaceStatus string

const (
	RaceUpcoming  RaceStatus = "UPCOMING"
	RaceCheckIn   RaceStatus = "CHECK_IN"
	RaceStarting  RaceStatus = "STARTING"
	RaceLive      RaceStatus = "LIVE"
	RaceFinished  RaceStatus = "FINISHED"
	RaceCancelled RaceStatus = "CANCELLED"
)

func (s RaceStatus) Valid() bool {
	switch s {
	case RaceUpcoming, RaceCheckIn, RaceStarting, RaceLive, RaceFinished, RaceCancelled:
		return true
	default:
		return false
	}
}

// DomainEvent names the meaningful moments a race-progress update should be
// sent for (item 12/14: "do not send APNs updates every second", update on
// events, not on a clock). Not yet wired to a real publisher -- see the
// package doc comment -- but typed now so the notification worker has a
// stable contract to call into once one exists.
type DomainEvent string

const (
	EventCheckInOpened  DomainEvent = "EventCheckInOpened"
	EventStartingSoon   DomainEvent = "EventStartingSoon"
	EventRaceStarted    DomainEvent = "RaceStarted"
	EventRaceProgress   DomainEvent = "RaceProgressUpdated"
	EventRunnerFinished DomainEvent = "RunnerFinished"
	EventRaceCancelled  DomainEvent = "RaceCancelled"
)

// LiveActivity is one runner's followed Live Activity for one event.
type LiveActivity struct {
	ID             uuid.UUID  `json:"id"`
	UserID         uuid.UUID  `json:"user_id"`
	EventID        uuid.UUID  `json:"event_id"`
	RegistrationID *uuid.UUID `json:"registration_id,omitempty"`
	ActivityID     string     `json:"activity_id"`
	DeviceID       string     `json:"device_id,omitempty"`
	// PushToken is never returned to the client that didn't just set it --
	// see handler.go's response shaping. It is only ever read by a future
	// APNs-sending Publisher.
	PushToken  string     `json:"-"`
	Platform   string     `json:"platform"`
	Status     Status     `json:"status"`
	RaceStatus RaceStatus `json:"race_status"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	EndedAt    *time.Time `json:"ended_at,omitempty"`
}

// CreateInput is what the mobile "Follow Live" action submits after
// ActivityKit hands back an activity id + push token on-device.
type CreateInput struct {
	EventID        uuid.UUID  `json:"event_id" validate:"required"`
	RegistrationID *uuid.UUID `json:"registration_id,omitempty"`
	ActivityID     string     `json:"activity_id" validate:"required,max=255"`
	DeviceID       string     `json:"device_id" validate:"max=255"`
	// PushToken is optional, not required: ActivityKit hands the token back
	// asynchronously and sometimes never (the iOS Simulator can't reach APNs
	// at all). Matches DefaultPublisher's own stance in service.go -- don't
	// block the follow relationship on something push-related actually working.
	PushToken string `json:"push_token" validate:"max=1024"`
	Platform  string `json:"platform" validate:"required,oneof=ios"`
}

// UpdateInput patches the race status shown in the activity (item 8's
// `raceLiveActivity.update`). Progress fields (distance, pace, elapsed) live
// entirely on-device / in the APNs payload the backend builds later -- they
// are not stored here, matching item 2's "keep static event data and
// frequently changing data separated."
type UpdateInput struct {
	RaceStatus *RaceStatus `json:"race_status,omitempty" validate:"omitempty"`
	PushToken  *string     `json:"push_token,omitempty" validate:"omitempty,max=1024"`
}
