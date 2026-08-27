package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ErrInvalidCredentials is returned on login failure. It's intentionally generic — callers must not reveal whether the email or the password was wrong
var ErrInvalidCredentials = errors.New("auth: invalid email or password")

var ErrUnverifiedOAuthEmail = errors.New("auth: oauth email is not verified")

var ErrCannotDemoteSelf = errors.New("auth: super admin cannot demote their own account")

// authRepository is the subset of Repository the service depends on.
// Defined here (consumer side) so tests can supply a fake.
type authRepository interface {
	CreateUserWithProfile(ctx context.Context, u *User, p *Profile) error
	GetUserByIdentity(ctx context.Context, provider, subject string) (*User, error)
	LinkIdentity(ctx context.Context, identity *OAuthIdentity) error
	GetUserByEmail(ctx context.Context, email string) (*User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (*User, error)
	GetProfileByUserID(ctx context.Context, userID uuid.UUID) (*Profile, error)
	UpdateProfile(ctx context.Context, p *Profile) error
	CreateRefreshToken(ctx context.Context, t *RefreshToken) error
	GetRefreshTokenByHash(ctx context.Context, hash string) (*RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, id uuid.UUID, now time.Time) error
	ListUsers(ctx context.Context, role *Role, limit, offset int) ([]User, int, error)
	UpdateUserRole(ctx context.Context, id uuid.UUID, role Role) (*User, error)
}

// Service implements auth business rules on top of a repository
type Service struct {
	repo              authRepository
	tokens            *TokenIssuer
	bcryptCost        int
	refreshTokenTTL   time.Duration
	dummyPasswordHash string
	now               func() time.Time
}

// NewService builds a Service. bcryptCost should be bcrypt.DefaultCost (10) or higher in production; tests may pass bcrypt.MinCost
func NewService(repo authRepository, tokens *TokenIssuer, bcryptCost int, refreshTokenTTL time.Duration) *Service {
	dummyPasswordHash, _ := HashPassword("unity-invalid-login-placeholder", bcryptCost)
	return &Service{
		repo:              repo,
		tokens:            tokens,
		bcryptCost:        bcryptCost,
		refreshTokenTTL:   refreshTokenTTL,
		dummyPasswordHash: dummyPasswordHash,
		now:               time.Now,
	}
}

// AuthResult bundles what callers need after register/login/refresh: the issued access token and the raw refresh token to set as a cookie (empty on operations that don't rotate it)
type AuthResult struct {
	User         *User
	AccessToken  string
	RefreshToken string
}

// Register creates a new user (role USER) with a profile, and issues an initial token pair
func (s *Service) Register(ctx context.Context, req RegisterRequest) (*AuthResult, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	hash, err := HashPassword(req.Password, s.bcryptCost)
	if err != nil {
		return nil, fmt.Errorf("auth: hash password: %w", err)
	}

	u := &User{Email: req.Email, PasswordHash: hash, Role: RoleUser}
	p := &Profile{FullName: req.FullName}

	if err := s.repo.CreateUserWithProfile(ctx, u, p); err != nil {
		return nil, err // ErrEmailTaken or wrapped DB error
	}

	return s.issueTokenPair(ctx, u)
}

// Login verifies credentials and issues a new token pair
func (s *Service) Login(ctx context.Context, req LoginRequest) (*AuthResult, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	u, err := s.repo.GetUserByEmail(ctx, req.Email)
	if errors.Is(err, ErrNotFound) {
		// Spend the same bcrypt work as a real account lookup so response timing does not disclose whether this email exists
		_ = VerifyPassword(s.dummyPasswordHash, req.Password)
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}

	if !VerifyPassword(u.PasswordHash, req.Password) {
		return nil, ErrInvalidCredentials
	}

	return s.issueTokenPair(ctx, u)
}

// LoginWithGoogle signs in an existing linked account, safely links a verified
// Google email to an existing local account, or creates a runner account
func (s *Service) LoginWithGoogle(ctx context.Context, profile GoogleProfile) (*AuthResult, error) {
	profile.Subject = strings.TrimSpace(profile.Subject)
	profile.Email = strings.ToLower(strings.TrimSpace(profile.Email))
	profile.FullName = strings.TrimSpace(profile.FullName)
	if profile.Subject == "" || profile.Email == "" || !profile.EmailVerified {
		return nil, ErrUnverifiedOAuthEmail
	}

	if linked, err := s.repo.GetUserByIdentity(ctx, "google", profile.Subject); err == nil {
		return s.issueTokenPair(ctx, linked)
	} else if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	u, err := s.repo.GetUserByEmail(ctx, profile.Email)
	if errors.Is(err, ErrNotFound) {
		randomPassword, genErr := generateRawToken()
		if genErr != nil {
			return nil, fmt.Errorf("auth: generate oauth placeholder password: %w", genErr)
		}
		hash, hashErr := HashPassword(randomPassword, s.bcryptCost)
		if hashErr != nil {
			return nil, fmt.Errorf("auth: hash oauth placeholder password: %w", hashErr)
		}
		if profile.FullName == "" {
			profile.FullName = strings.Split(profile.Email, "@")[0]
		}
		u = &User{Email: profile.Email, PasswordHash: hash, Role: RoleUser}
		p := &Profile{FullName: profile.FullName, AvatarURL: profile.AvatarURL}
		if createErr := s.repo.CreateUserWithProfile(ctx, u, p); createErr != nil {
			if !errors.Is(createErr, ErrEmailTaken) {
				return nil, createErr
			}
			u, err = s.repo.GetUserByEmail(ctx, profile.Email)
			if err != nil {
				return nil, err
			}
		}
	} else if err != nil {
		return nil, err
	}

	identity := &OAuthIdentity{UserID: u.ID, Provider: "google", Subject: profile.Subject, Email: profile.Email}
	if err := s.repo.LinkIdentity(ctx, identity); err != nil {
		return nil, err
	}
	// Re-read the canonical link. This also resolves a simultaneous first login without ever issuing a session for the wrong provider subject
	linked, err := s.repo.GetUserByIdentity(ctx, "google", profile.Subject)
	if err != nil {
		return nil, err
	}
	return s.issueTokenPair(ctx, linked)
}

// Refresh validates the presented raw refresh token, revokes it, and issues a new token pair (rotation-on-use)
func (s *Service) Refresh(ctx context.Context, rawRefreshToken string) (*AuthResult, error) {
	hash := hashToken(rawRefreshToken)

	stored, err := s.repo.GetRefreshTokenByHash(ctx, hash)
	if errors.Is(err, ErrNotFound) {
		return nil, ErrInvalidToken
	}
	if err != nil {
		return nil, err
	}

	if !stored.IsActive(s.now()) {
		return nil, ErrInvalidToken
	}

	if err := s.repo.RevokeRefreshToken(ctx, stored.ID, s.now()); err != nil {
		return nil, err
	}

	u, err := s.repo.GetUserByID(ctx, stored.UserID)
	if err != nil {
		return nil, err
	}

	return s.issueTokenPair(ctx, u)
}

// Logout revokes the presented raw refresh token. Revoking an already-invalid token is treated as success (idempotent logout)
func (s *Service) Logout(ctx context.Context, rawRefreshToken string) error {
	hash := hashToken(rawRefreshToken)

	stored, err := s.repo.GetRefreshTokenByHash(ctx, hash)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}

	err = s.repo.RevokeRefreshToken(ctx, stored.ID, s.now())
	if errors.Is(err, ErrNotFound) {
		return nil // already revoked
	}
	return err
}

// GetProfile returns the profile for userID
func (s *Service) GetProfile(ctx context.Context, userID uuid.UUID) (*Profile, error) {
	return s.repo.GetProfileByUserID(ctx, userID)
}

// GetUserByID returns the user by ID
func (s *Service) GetUserByID(ctx context.Context, userID uuid.UUID) (*User, error) {
	return s.repo.GetUserByID(ctx, userID)
}

// ListUsers returns a paginated account directory for super-admin tooling
func (s *Service) ListUsers(ctx context.Context, role *Role, limit, offset int) ([]User, int, error) {
	if role != nil && !role.IsValid() {
		return nil, 0, fmt.Errorf("auth: invalid role")
	}
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}
	return s.repo.ListUsers(ctx, role, limit, offset)
}

// UpdateUserRole changes an account role. A super admin cannot demote their own active session, preventing an accidental administrative lockout
func (s *Service) UpdateUserRole(ctx context.Context, actorID, targetID uuid.UUID, role Role) (*User, error) {
	if !role.IsValid() {
		return nil, fmt.Errorf("auth: invalid role")
	}
	if actorID == targetID && role != RoleSuperAdmin {
		return nil, ErrCannotDemoteSelf
	}
	return s.repo.UpdateUserRole(ctx, targetID, role)
}

// UpdateProfile applies a partial update to the profile for userID
func (s *Service) UpdateProfile(ctx context.Context, userID uuid.UUID, req UpdateProfileRequest) (*Profile, error) {
	p, err := s.repo.GetProfileByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if req.FullName != nil {
		p.FullName = *req.FullName
	}
	if req.Phone != nil {
		p.Phone = *req.Phone
	}
	if req.DateOfBirth != nil {
		d, err := time.Parse("2006-01-02", *req.DateOfBirth)
		if err != nil {
			return nil, fmt.Errorf("auth: invalid date_of_birth: %w", err)
		}
		p.DateOfBirth = &d
	}
	if req.Gender != nil {
		p.Gender = *req.Gender
	}
	if req.EmergencyContactName != nil {
		p.EmergencyContactName = *req.EmergencyContactName
	}
	if req.EmergencyContactPhone != nil {
		p.EmergencyContactPhone = *req.EmergencyContactPhone
	}
	if req.TshirtSize != nil {
		p.TshirtSize = *req.TshirtSize
	}
	if req.AvatarURL != nil {
		p.AvatarURL = *req.AvatarURL
	}

	if err := s.repo.UpdateProfile(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// issueTokenPair generates an access token and a new raw refresh token, persisting only the refresh token's hash
func (s *Service) issueTokenPair(ctx context.Context, u *User) (*AuthResult, error) {
	accessToken, err := s.tokens.GenerateAccessToken(u.ID, u.Role)
	if err != nil {
		return nil, err
	}

	rawRefreshToken, err := generateRawToken()
	if err != nil {
		return nil, fmt.Errorf("auth: generate refresh token: %w", err)
	}

	rt := &RefreshToken{
		UserID:    u.ID,
		TokenHash: hashToken(rawRefreshToken),
		ExpiresAt: s.now().Add(s.refreshTokenTTL),
	}
	if err := s.repo.CreateRefreshToken(ctx, rt); err != nil {
		return nil, err
	}

	return &AuthResult{User: u, AccessToken: accessToken, RefreshToken: rawRefreshToken}, nil
}

// generateRawToken returns a cryptographically random, URL-safe token
func generateRawToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// hashToken returns a hex-encoded SHA-256 hash of a raw refresh token, for storage/lookup (never store the raw token)
func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
