package events

import (
	"time"

	"github.com/go-playground/validator/v10"
)

var validate = validator.New(validator.WithRequiredStructEnabled())

// CreateEventRequest is the payload for POST /api/v1/events
type CreateEventRequest struct {
	Name                string     `json:"name" validate:"required,max=200"`
	Slug                string     `json:"slug" validate:"omitempty,max=200,slug"`
	Description         string     `json:"description"`
	CoverImage          string     `json:"cover_image"`
	EventDate           string     `json:"event_date" validate:"required,datetime=2006-01-02"`
	StartTime           string     `json:"start_time" validate:"required,datetime=15:04"`
	Location            string     `json:"location"`
	Latitude            *float64   `json:"latitude" validate:"omitempty,min=-90,max=90"`
	Longitude           *float64   `json:"longitude" validate:"omitempty,min=-180,max=180"`
	RegistrationOpenAt  *time.Time `json:"registration_open_at"`
	RegistrationCloseAt *time.Time `json:"registration_close_at"`
}

// DuplicateEventRequest describes the new edition created from an existing event.
// Reusable race content is copied, while lifecycle and registration windows reset.
type DuplicateEventRequest struct {
	Name      string `json:"name" validate:"required,max=200"`
	EventDate string `json:"event_date" validate:"required,datetime=2006-01-02"`
}

// UpdateEventRequest is the payload for PATCH /api/v1/events/:id
type UpdateEventRequest struct {
	Name                *string    `json:"name" validate:"omitempty,max=200"`
	Slug                *string    `json:"slug" validate:"omitempty,max=200,slug"`
	Description         *string    `json:"description"`
	CoverImage          *string    `json:"cover_image"`
	EventDate           *string    `json:"event_date" validate:"omitempty,datetime=2006-01-02"`
	StartTime           *string    `json:"start_time" validate:"omitempty,datetime=15:04"`
	Location            *string    `json:"location"`
	Latitude            *float64   `json:"latitude" validate:"omitempty,min=-90,max=90"`
	Longitude           *float64   `json:"longitude" validate:"omitempty,min=-180,max=180"`
	ClearCoordinates    bool       `json:"clear_coordinates"`
	RegistrationOpenAt  *time.Time `json:"registration_open_at"`
	RegistrationCloseAt *time.Time `json:"registration_close_at"`
	Status              *Status    `json:"status"`
}

// CreateCategoryRequest is the payload for POST /api/v1/events/:id/categories
type CreateCategoryRequest struct {
	Name                 string     `json:"name" validate:"required,max=100"`
	Distance             string     `json:"distance" validate:"required,max=50"`
	PriceCents           int        `json:"price_cents" validate:"min=0"`
	Currency             string     `json:"currency" validate:"omitempty,oneof=USD KHR"`
	Capacity             int        `json:"capacity" validate:"required,min=0"`
	RegistrationDeadline *time.Time `json:"registration_deadline"`
}

// UpdateCategoryRequest is the payload for PATCH /api/v1/events/:id/categories/:categoryId
type UpdateCategoryRequest struct {
	Name                      *string    `json:"name" validate:"omitempty,max=100"`
	Distance                  *string    `json:"distance" validate:"omitempty,max=50"`
	PriceCents                *int       `json:"price_cents" validate:"omitempty,min=0"`
	Currency                  *string    `json:"currency" validate:"omitempty,oneof=USD KHR"`
	Capacity                  *int       `json:"capacity" validate:"omitempty,min=0"`
	RegistrationDeadline      *time.Time `json:"registration_deadline"`
	ClearRegistrationDeadline bool       `json:"clear_registration_deadline"`
	Status                    *string    `json:"status" validate:"omitempty,oneof=OPEN CLOSED SOLD_OUT"`
}

// CreateScheduleRequest is the payload for POST /api/v1/events/:id/schedules
type CreateScheduleRequest struct {
	Time        string `json:"time" validate:"required,datetime=15:04:05"`
	Title       string `json:"title" validate:"required,max=200"`
	Description string `json:"description" validate:"max=1000"`
	SortOrder   int    `json:"sort_order"`
}

// UpdateScheduleRequest is the payload for PATCH /api/v1/events/:id/schedules/:scheduleId
type UpdateScheduleRequest struct {
	Time        *string `json:"time" validate:"omitempty,datetime=15:04:05"`
	Title       *string `json:"title" validate:"omitempty,max=200"`
	Description *string `json:"description" validate:"omitempty,max=1000"`
	SortOrder   *int    `json:"sort_order"`
}

// CreateFAQRequest is the payload for POST /api/v1/events/:id/faqs
type CreateFAQRequest struct {
	Question  string `json:"question" validate:"required,max=300"`
	Answer    string `json:"answer" validate:"required,max=3000"`
	SortOrder int    `json:"sort_order" validate:"min=0"`
}

// UpdateFAQRequest is the payload for PATCH /api/v1/events/:id/faqs/:faqId
type UpdateFAQRequest struct {
	Question  *string `json:"question" validate:"omitempty,max=300"`
	Answer    *string `json:"answer" validate:"omitempty,max=3000"`
	SortOrder *int    `json:"sort_order" validate:"omitempty,min=0"`
}

// CreateRuleRequest is the payload for POST /api/v1/events/:id/rules
type CreateRuleRequest struct {
	Rule      string `json:"rule" validate:"required,max=1000"`
	SortOrder int    `json:"sort_order" validate:"min=0"`
}

// UpdateRuleRequest is the payload for PATCH /api/v1/events/:id/rules/:ruleId
type UpdateRuleRequest struct {
	Rule      *string `json:"rule" validate:"omitempty,max=1000"`
	SortOrder *int    `json:"sort_order" validate:"omitempty,min=0"`
}

// init registers the slug validation
func init() {
	_ = validate.RegisterValidation("slug", func(fl validator.FieldLevel) bool {
		s := fl.Field().String()
		if s == "" {
			return true
		}
		for _, r := range s {
			isLower := r >= 'a' && r <= 'z'
			isDigit := r >= '0' && r <= '9'
			if !isLower && !isDigit && r != '-' {
				return false
			}
		}
		return s[0] != '-' && s[len(s)-1] != '-'
	})
}
