package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// signTestGoogleIDToken builds a Google-shaped ID token signed with key, so tests can exercise
// googleIDTokenVerifier without any real network call to Google.
func signTestGoogleIDToken(t *testing.T, key *rsa.PrivateKey, kid string, claims googleIDTokenClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

// newTestVerifier seeds the verifier's key cache directly, bypassing the JWKS fetch.
func newTestVerifier(t *testing.T, audience string) (*googleIDTokenVerifier, *rsa.PrivateKey, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	const kid = "test-kid"
	v := newGoogleIDTokenVerifier(&http.Client{Timeout: time.Second}, audience)
	v.keys[kid] = &key.PublicKey
	v.fetchedAt = time.Now()
	return v, key, kid
}

func validGoogleClaims(audience string) googleIDTokenClaims {
	return googleIDTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "https://accounts.google.com",
			Subject:   "116910000000000000000",
			Audience:  jwt.ClaimStrings{audience},
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
		Email:         "Runner@Example.com",
		EmailVerified: true,
		Name:          "Runner",
	}
}

func TestGoogleIDTokenVerifier_AcceptsValidToken(t *testing.T) {
	v, key, kid := newTestVerifier(t, "web-client-id")
	token := signTestGoogleIDToken(t, key, kid, validGoogleClaims("web-client-id"))

	profile, err := v.verify(context.Background(), token)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if profile.Subject != "116910000000000000000" || profile.Email != "runner@example.com" || !profile.EmailVerified {
		t.Fatalf("unexpected profile: %+v", profile)
	}
}

func TestGoogleIDTokenVerifier_RejectsWrongAudience(t *testing.T) {
	v, key, kid := newTestVerifier(t, "web-client-id")
	token := signTestGoogleIDToken(t, key, kid, validGoogleClaims("some-other-client-id"))

	if _, err := v.verify(context.Background(), token); err == nil {
		t.Fatal("expected audience mismatch to be rejected")
	}
}

func TestGoogleIDTokenVerifier_RejectsExpiredToken(t *testing.T) {
	v, key, kid := newTestVerifier(t, "web-client-id")
	claims := validGoogleClaims("web-client-id")
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Hour))
	token := signTestGoogleIDToken(t, key, kid, claims)

	if _, err := v.verify(context.Background(), token); err == nil {
		t.Fatal("expected expired token to be rejected")
	}
}

func TestGoogleIDTokenVerifier_RejectsUnverifiedEmail(t *testing.T) {
	v, key, kid := newTestVerifier(t, "web-client-id")
	claims := validGoogleClaims("web-client-id")
	claims.EmailVerified = false
	token := signTestGoogleIDToken(t, key, kid, claims)

	if _, err := v.verify(context.Background(), token); err == nil {
		t.Fatal("expected unverified email to be rejected")
	}
}

func TestGoogleIDTokenVerifier_RejectsUnknownIssuer(t *testing.T) {
	v, key, kid := newTestVerifier(t, "web-client-id")
	claims := validGoogleClaims("web-client-id")
	claims.Issuer = "https://evil.example.com"
	token := signTestGoogleIDToken(t, key, kid, claims)

	if _, err := v.verify(context.Background(), token); err == nil {
		t.Fatal("expected unrecognized issuer to be rejected")
	}
}

func TestGoogleIDTokenVerifier_RejectsTokenSignedByUnknownKey(t *testing.T) {
	v, _, _ := newTestVerifier(t, "web-client-id")
	forgedKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	// "test-kid" is cached in v against a different public key, so this must fail even
	// though the kid header matches.
	token := signTestGoogleIDToken(t, forgedKey, "test-kid", validGoogleClaims("web-client-id"))

	if _, err := v.verify(context.Background(), token); err == nil {
		t.Fatal("expected a signature from an unrecognized key to be rejected")
	}
}

// TestMobileGoogleSignIn_RoundTrip exercises the HTTP handler end to end: a verified ID token
// is exchanged for the same bearer session password login would issue.
func TestMobileGoogleSignIn_RoundTrip(t *testing.T) {
	h := newGoogleTestHandler(t) // ClientID "client-id" -- see newGoogleTestHandler
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	const kid = "test-kid"
	h.google.verifier.keys[kid] = &key.PublicKey
	h.google.verifier.fetchedAt = time.Now()
	token := signTestGoogleIDToken(t, key, kid, validGoogleClaims("client-id"))

	body, _ := json.Marshal(map[string]string{"id_token": token})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/mobile/google", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.MobileGoogleSignIn(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Set-Cookie") != "" {
		t.Fatal("native response must not mutate browser cookies")
	}
	var out struct {
		Data authResponse `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Data.AccessToken == "" || out.Data.RefreshToken == "" {
		t.Fatal("native session requires both tokens")
	}
	if out.Data.User.Email != "runner@example.com" {
		t.Fatalf("unexpected user: %+v", out.Data.User)
	}

	// A malformed token must not authenticate.
	badBody, _ := json.Marshal(map[string]string{"id_token": "not-a-jwt"})
	badReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/mobile/google", bytes.NewReader(badBody))
	badRec := httptest.NewRecorder()
	h.MobileGoogleSignIn(badRec, badReq)
	if badRec.Code != http.StatusUnauthorized {
		t.Fatalf("malformed token status = %d, want 401", badRec.Code)
	}
}

func TestMobileGoogleSignIn_Unconfigured(t *testing.T) {
	svc, _ := newTestService()
	h := NewHandler(svc, time.Hour, false) // ConfigureGoogle was never called
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/mobile/google", bytes.NewReader([]byte(`{"id_token":"x"}`)))
	rec := httptest.NewRecorder()
	h.MobileGoogleSignIn(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestMobileGoogleSignIn_MissingToken(t *testing.T) {
	h := newGoogleTestHandler(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/mobile/google", bytes.NewReader([]byte(`{}`)))
	rec := httptest.NewRecorder()
	h.MobileGoogleSignIn(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
