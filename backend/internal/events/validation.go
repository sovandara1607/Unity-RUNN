package events

import (
	"time"

	"github.com/go-playground/validator/v10"
)

var validate = validator.New(validator.WithRequiredStructEnabled())

// CreateEventRequest is the payload for POST /api/v1/events.
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

// UpdateEventRequest is the payload for PATCH /api/v1/events/:id.
// All fields are optional pointers; only non-nil fields are applied.
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
	RegistrationOpenAt  *time.Time `json:"registration_open_at"`
	RegistrationCloseAt *time.Time `json:"registration_close_at"`
	Status              *Status    `json:"status"`
}

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
