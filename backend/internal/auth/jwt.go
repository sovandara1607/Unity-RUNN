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
	token, err := jwt.ParseWithClaims(raw, &claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return i.secret, nil
	})
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}
	return &claims, nil
}
