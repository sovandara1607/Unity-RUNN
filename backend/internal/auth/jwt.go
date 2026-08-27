package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// ErrInvalidToken covers every way an access token can fail to
// validate: bad signature, malformed, expired, or unknown claims.
var ErrInvalidToken = errors.New("auth: invalid access token")

const (
	accessTokenIssuer   = "unity-run-club-api"
	accessTokenAudience = "unity-run-club-web"
)

// Claims is the JWT payload for access tokens.
type Claims struct {
	UserID uuid.UUID `json:"sub_uuid"`
	Role   Role      `json:"role"`
	jwt.RegisteredClaims
}

// TokenIssuer generates and parses access tokens with a fixed HS256
// secret and TTL.
type TokenIssuer struct {
	secret []byte
	ttl    time.Duration
}

// NewTokenIssuer builds a TokenIssuer. secret must be non-empty.
func NewTokenIssuer(secret string, ttl time.Duration) *TokenIssuer {
	return &TokenIssuer{secret: []byte(secret), ttl: ttl}
}

// GenerateAccessToken issues a signed JWT for the given user/role.
func (i *TokenIssuer) GenerateAccessToken(userID uuid.UUID, role Role) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			Issuer:    accessTokenIssuer,
			Audience:  jwt.ClaimStrings{accessTokenAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(i.ttl)),
			ID:        uuid.NewString(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(i.secret)
	if err != nil {
		return "", fmt.Errorf("auth: sign token: %w", err)
	}
	return signed, nil
}

// ParseAccessToken validates the signature and expiry of raw and
// returns its claims.
func (i *TokenIssuer) ParseAccessToken(raw string) (*Claims, error) {
	var claims Claims
	token, err := jwt.ParseWithClaims(raw, &claims, func(_ *jwt.Token) (any, error) {
		return i.secret, nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(accessTokenIssuer),
		jwt.WithAudience(accessTokenAudience),
		jwt.WithIssuedAt(),
	)
	if err != nil || !token.Valid || claims.UserID == uuid.Nil || !claims.Role.IsValid() || claims.Subject != claims.UserID.String() {
		return nil, ErrInvalidToken
	}
	return &claims, nil
}
