package auth

import (
	"time"

	"github.com/google/uuid"
)

// Role is a user's access level. Roles form a fixed hierarchy — there's no separate roles table, since the set is small and static (mirrors the same TEXT+CHECK choice made for events.status)
type Role string

const (
	RoleUser       Role = "USER"
	RoleStaff      Role = "STAFF"
	RoleAdmin      Role = "ADMIN"
	RoleSuperAdmin Role = "SUPER_ADMIN"
)

// roleRank orders roles from least to most privileged
var roleRank = map[Role]int{
	RoleUser:       0,
	RoleStaff:      1,
	RoleAdmin:      2,
	RoleSuperAdmin: 3,
}

// IsValid reports whether r is one of the known roles
func (r Role) IsValid() bool {
	_, ok := roleRank[r]
	return ok
}

// AtLeast reports whether r is at or above min in the role hierarchy
// An unrecognized role is never at least anything.
func (r Role) AtLeast(min Role) bool {
	rr, ok := roleRank[r]
	if !ok {
		return false
	}
	mr, ok := roleRank[min]
	if !ok {
		return false
	}
	return rr >= mr
}

// User is an account record. PasswordHash is never serialized to
// JSON or logged
type User struct {
	ID           uuid.UUID
	Email        string
	PasswordHash string
	Role         Role
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Profile holds the participant-facing details for a user — the same fields event registrations will reuse in a later phase
type Profile struct {
	ID                    uuid.UUID  `json:"id"`
	UserID                uuid.UUID  `json:"user_id"`
	FullName              string     `json:"full_name"`
	Phone                 string     `json:"phone"`
	DateOfBirth           *time.Time `json:"date_of_birth"`
	Gender                string     `json:"gender"`
	EmergencyContactName  string     `json:"emergency_contact_name"`
	EmergencyContactPhone string     `json:"emergency_contact_phone"`
	TshirtSize            string     `json:"tshirt_size"`
	AvatarURL             string     `json:"avatar_url"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

// RefreshToken is a persisted, hashed refresh token. The raw token value is never stored — only TokenHash (sha256 of the raw token)
type RefreshToken struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	TokenHash string
	ExpiresAt time.Time
	RevokedAt *time.Time
	CreatedAt time.Time
}

// OAuthIdentity links a local account to a stable identity-provider subject
// Provider access and refresh tokens are deliberately never persisted
type OAuthIdentity struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	Provider  string
	Subject   string
	Email     string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// GoogleProfile is the minimum verified OpenID profile needed to sign in
type GoogleProfile struct {
	Subject       string
	Email         string
	EmailVerified bool
	FullName      string
	AvatarURL     string
}

// IsActive reports whether the refresh token is neither expired nor revoked as of now
func (t RefreshToken) IsActive(now time.Time) bool {
	return t.RevokedAt == nil && now.Before(t.ExpiresAt)
}
