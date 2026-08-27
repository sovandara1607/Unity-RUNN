package auth

import "github.com/go-playground/validator/v10"

var validate = validator.New(validator.WithRequiredStructEnabled())

// RegisterRequest is the payload for POST /api/v1/auth/register.
type RegisterRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8,max=72"`
	FullName string `json:"full_name" validate:"required,max=200"`
}

// LoginRequest is the payload for POST /api/v1/auth/login.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,max=72"`
}

// UpdateProfileRequest is the payload for PATCH /api/v1/me. All
// fields are optional pointers; only non-nil fields are applied.
type UpdateProfileRequest struct {
	FullName              *string `json:"full_name" validate:"omitempty,max=200"`
	Phone                 *string `json:"phone" validate:"omitempty,max=30"`
	DateOfBirth           *string `json:"date_of_birth" validate:"omitempty,datetime=2006-01-02"`
	Gender                *string `json:"gender" validate:"omitempty,max=30"`
	EmergencyContactName  *string `json:"emergency_contact_name" validate:"omitempty,max=200"`
	EmergencyContactPhone *string `json:"emergency_contact_phone" validate:"omitempty,max=30"`
	TshirtSize            *string `json:"tshirt_size" validate:"omitempty,max=10"`
	AvatarURL             *string `json:"avatar_url" validate:"omitempty,max=500"`
}
