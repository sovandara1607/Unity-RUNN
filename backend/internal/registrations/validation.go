package registrations

import "github.com/go-playground/validator/v10"

var validate = validator.New(validator.WithRequiredStructEnabled())

// RegisterRequest is the payload for POST /api/v1/events/:eventId/registrations.
type RegisterRequest struct {
	EventCategoryID       string `json:"event_category_id" validate:"required,uuid"`
	FullName              string `json:"full_name" validate:"required,max=200"`
	Email                 string `json:"email" validate:"required,email"`
	Phone                 string `json:"phone" validate:"required,max=30"`
	DateOfBirth           string `json:"date_of_birth" validate:"required,datetime=2006-01-02"`
	Gender                string `json:"gender" validate:"required,max=30"`
	EmergencyContactName  string `json:"emergency_contact_name" validate:"required,max=200"`
	EmergencyContactPhone string `json:"emergency_contact_phone" validate:"required,max=30"`
	TshirtSize            string `json:"tshirt_size" validate:"required,max=10"`
}
