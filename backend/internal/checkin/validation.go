package checkin

import "github.com/go-playground/validator/v10"

var validate = validator.New(validator.WithRequiredStructEnabled())

// CheckInRequest is the payload for POST /api/v1/check-in.
type CheckInRequest struct {
	Token   string `json:"token" validate:"required,max=512"`
	EventID string `json:"event_id" validate:"omitempty,uuid"`
}
