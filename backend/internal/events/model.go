// Package events implements the Event domain: events, their
// categories, schedule, FAQs, and rules. It follows the standard
// handler -> validation -> service -> repository layering used
// throughout the backend.
package events

import (
	"time"

	"github.com/google/uuid"
)

// Status is an event's lifecycle state.
type Status string

const (
	StatusDraft              Status = "DRAFT"
	StatusPublished          Status = "PUBLISHED"
	StatusRegistrationOpen   Status = "REGISTRATION_OPEN"
	StatusRegistrationClosed Status = "REGISTRATION_CLOSED"
	StatusCompleted          Status = "COMPLETED"
	StatusCancelled          Status = "CANCELLED"
	StatusArchived           Status = "ARCHIVED"
)

// publicStatuses is the set of statuses visible to unauthenticated
// callers. DRAFT, CANCELLED, and ARCHIVED are hidden from the public.
var publicStatuses = map[Status]bool{
	StatusPublished:          true,
	StatusRegistrationOpen:   true,
	StatusRegistrationClosed: true,
	StatusCompleted:          true,
}

// IsPublic reports whether events in this status should be visible
// to unauthenticated callers.
func (s Status) IsPublic() bool {
	return publicStatuses[s]
}

// validStatuses is the full set of allowed status values, mirroring
// the database CHECK constraint.
var validStatuses = map[Status]bool{
	StatusDraft: true, StatusPublished: true, StatusRegistrationOpen: true,
	StatusRegistrationClosed: true, StatusCompleted: true,
	StatusCancelled: true, StatusArchived: true,
}

// IsValid reports whether s is one of the known event statuses.
func (s Status) IsValid() bool {
	return validStatuses[s]
}

// allowedTransitions maps each status to the set of statuses it may
// move to. Terminal statuses (COMPLETED, CANCELLED, ARCHIVED... aside
// from COMPLETED->ARCHIVED and CANCELLED->ARCHIVED) have no further
// transitions.
var allowedTransitions = map[Status]map[Status]bool{
	StatusDraft:              {StatusPublished: true, StatusCancelled: true},
	StatusPublished:          {StatusRegistrationOpen: true, StatusCancelled: true},
	StatusRegistrationOpen:   {StatusRegistrationClosed: true, StatusCancelled: true},
	StatusRegistrationClosed: {StatusCompleted: true, StatusCancelled: true},
	StatusCompleted:          {StatusArchived: true},
	StatusCancelled:          {StatusArchived: true},
	StatusArchived:           {},
}

// CanTransitionTo reports whether moving from s to next is allowed.
// Transitioning to the same status is always a no-op allowed case.
func (s Status) CanTransitionTo(next Status) bool {
	if s == next {
		return true
	}
	return allowedTransitions[s][next]
}

// Event is the core event record.
type Event struct {
	ID                  uuid.UUID  `json:"id"`
	Name                string     `json:"name"`
	Slug                string     `json:"slug"`
	Description         string     `json:"description"`
	CoverImage          string     `json:"cover_image"`
	EventDate           time.Time  `json:"event_date"`
	StartTime           time.Time  `json:"start_time"`
	Location            string     `json:"location"`
	Latitude            *float64   `json:"latitude"`
	Longitude           *float64   `json:"longitude"`
	RegistrationOpenAt  *time.Time `json:"registration_open_at"`
	RegistrationCloseAt *time.Time `json:"registration_close_at"`
	Status              Status     `json:"status"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// EventDetail bundles an event with its child collections, as
// returned by GET /events/:slug.
type EventDetail struct {
	Event
	Categories []EventCategory `json:"categories"`
	Schedule   []EventSchedule `json:"schedule"`
	FAQs       []EventFAQ      `json:"faqs"`
	Rules      []EventRule     `json:"rules"`
}

// EventCategory is a registerable category within an event (e.g. 10K).
type EventCategory struct {
	ID                   uuid.UUID  `json:"id"`
	EventID              uuid.UUID  `json:"event_id"`
	Name                 string     `json:"name"`
	Distance             string     `json:"distance"`
	PriceCents           int        `json:"price_cents"`
	Capacity             int        `json:"capacity"`
	RegistrationDeadline *time.Time `json:"registration_deadline"`
	Status               string     `json:"status"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

// EventSchedule is one line item in an event's day-of schedule.
type EventSchedule struct {
	ID          uuid.UUID `json:"id"`
	EventID     uuid.UUID `json:"event_id"`
	Time        time.Time `json:"time"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	SortOrder   int       `json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// EventFAQ is one question/answer pair for an event.
type EventFAQ struct {
	ID        uuid.UUID `json:"id"`
	EventID   uuid.UUID `json:"event_id"`
	Question  string    `json:"question"`
	Answer    string    `json:"answer"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// EventRule is one rule line item for an event.
type EventRule struct {
	ID        uuid.UUID `json:"id"`
	EventID   uuid.UUID `json:"event_id"`
	Rule      string    `json:"rule"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListFilter narrows a List query.
type ListFilter struct {
	// Statuses restricts results to these statuses. Empty means "use
	// the public status set" — callers pass explicit statuses only
	// when the admin key was presented.
	Statuses []Status
	Limit    int
	Offset   int
}
