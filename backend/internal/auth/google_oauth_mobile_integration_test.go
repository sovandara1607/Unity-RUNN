//go:build integration

package auth

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// TestCompleteMobileGoogleLogin_RoundTrip exercises the deep-link handoff end to end against a
// real Redis: completeMobileGoogleLogin issues a one-time code, MobileGoogleCallback redeems it
// for the same bearer session, and a second redemption of the same code is rejected.
func TestCompleteMobileGoogleLogin_RoundTrip(t *testing.T) {
	addr := os.Getenv("REDIS_TEST_ADDR")
	if addr == "" {
		t.Skip("REDIS_TEST_ADDR is required")
	}
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	t.Cleanup(func() { _ = rdb.Close() })

	svc, _ := newTestService()
	h := NewHandler(svc, time.Hour, false)
	h.ConfigureGoogle(GoogleOAuthConfig{
		ClientID: "client-id", ClientSecret: "client-secret",
		RedirectURL: "http://localhost:8080/api/v1/auth/google/callback", PublicAppURL: "http://localhost:3000",
	})
	h.ConfigureGoogleMobile(rdb)

	result, err := svc.Register(t.Context(), RegisterRequest{
		Email: "mobile-google@example.com", Password: "correct horse battery staple", FullName: "Mobile Runner",
	})
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/callback", nil)
	h.completeMobileGoogleLogin(rr, req, result)

	location := rr.Header().Get("Location")
	parsed, err := url.Parse(location)
	if err != nil || !strings.HasPrefix(location, mobileDeepLinkRedirect) {
		t.Fatalf("redirect = %q, want it to start with %q", location, mobileDeepLinkRedirect)
	}
	code := parsed.Query().Get("code")
	if code == "" {
		t.Fatalf("redirect %q carried no code", location)
	}

	exchangeReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/mobile/google/callback", strings.NewReader(`{"code":"`+code+`"}`))
	exchangeRR := httptest.NewRecorder()
	h.MobileGoogleCallback(exchangeRR, exchangeReq)
	if exchangeRR.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", exchangeRR.Code, exchangeRR.Body.String())
	}
	if !strings.Contains(exchangeRR.Body.String(), result.User.Email) {
		t.Fatalf("body did not carry the signed-in user: %s", exchangeRR.Body.String())
	}

	// The code is single-use: redeeming it again must fail.
	replayReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/mobile/google/callback", strings.NewReader(`{"code":"`+code+`"}`))
	replayRR := httptest.NewRecorder()
	h.MobileGoogleCallback(replayRR, replayReq)
	if replayRR.Code != http.StatusUnauthorized {
		t.Fatalf("replay status = %d, want 401 for an already-used code", replayRR.Code)
	}
}
