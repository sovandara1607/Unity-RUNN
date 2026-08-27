package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestTokenIssuer_GenerateAndParse(t *testing.T) {
	issuer := NewTokenIssuer("test-secret", time.Hour)
	userID := uuid.New()

	token, err := issuer.GenerateAccessToken(userID, RoleAdmin)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error = %v", err)
	}

	claims, err := issuer.ParseAccessToken(token)
	if err != nil {
		t.Fatalf("ParseAccessToken() error = %v", err)
	}
	if claims.UserID != userID {
		t.Errorf("UserID = %v, want %v", claims.UserID, userID)
	}
	if claims.Role != RoleAdmin {
		t.Errorf("Role = %q, want %q", claims.Role, RoleAdmin)
	}
}

func TestTokenIssuer_ExpiredTokenRejected(t *testing.T) {
	issuer := NewTokenIssuer("test-secret", -time.Minute) // already expired
	token, err := issuer.GenerateAccessToken(uuid.New(), RoleUser)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error = %v", err)
	}

	if _, err := issuer.ParseAccessToken(token); err == nil {
		t.Fatal("ParseAccessToken() expected error for expired token, got nil")
	}
}

func TestTokenIssuer_TamperedSignatureRejected(t *testing.T) {
	issuer := NewTokenIssuer("test-secret", time.Hour)
	token, err := issuer.GenerateAccessToken(uuid.New(), RoleUser)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error = %v", err)
	}

	otherIssuer := NewTokenIssuer("different-secret", time.Hour)
	if _, err := otherIssuer.ParseAccessToken(token); err == nil {
		t.Fatal("ParseAccessToken() expected error for token signed with a different secret, got nil")
	}
}

func TestTokenIssuer_RejectsDifferentHMACAlgorithm(t *testing.T) {
	issuer := NewTokenIssuer("test-secret", time.Hour)
	userID := uuid.New()
	now := time.Now()
	claims := Claims{
		UserID: userID,
		Role:   RoleUser,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: userID.String(), Issuer: accessTokenIssuer,
			Audience: jwt.ClaimStrings{accessTokenAudience},
			IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
		},
	}
	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString([]byte("test-secret"))
	if err != nil {
		t.Fatalf("sign HS512 token: %v", err)
	}
	if _, err := issuer.ParseAccessToken(raw); err == nil {
		t.Fatal("ParseAccessToken() accepted HS512 token, want HS256 only")
	}
}

func TestRole_AtLeast(t *testing.T) {
	cases := []struct {
		role Role
		min  Role
		want bool
	}{
		{RoleUser, RoleUser, true},
		{RoleStaff, RoleUser, true},
		{RoleUser, RoleStaff, false},
		{RoleAdmin, RoleStaff, true},
		{RoleSuperAdmin, RoleAdmin, true},
		{RoleAdmin, RoleSuperAdmin, false},
		{Role("BOGUS"), RoleUser, false},
	}
	for _, c := range cases {
		if got := c.role.AtLeast(c.min); got != c.want {
			t.Errorf("Role(%q).AtLeast(%q) = %v, want %v", c.role, c.min, got, c.want)
		}
	}
}
