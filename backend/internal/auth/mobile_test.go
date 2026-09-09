package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func mobileRequest(h *Handler, action string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/mobile/"+action, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	handlers := map[string]http.HandlerFunc{"register": h.MobileRegister, "login": h.MobileLogin, "refresh": h.MobileRefresh, "logout": h.MobileLogout}
	handlers[action](rec, req)
	return rec
}
func readMobileSession(t *testing.T, rec *httptest.ResponseRecorder, status int) authResponse {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status %d, want %d: %s", rec.Code, status, rec.Body.String())
	}
	if rec.Header().Get("Set-Cookie") != "" {
		t.Fatal("native response must not mutate browser cookies")
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("session must not be cached")
	}
	var body struct {
		Data authResponse `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Data.AccessToken == "" || body.Data.RefreshToken == "" {
		t.Fatal("native session requires both tokens")
	}
	return body.Data
}
func TestMobileSessionLifecycleAndTransportIsolation(t *testing.T) {
	h, web := newTestHandler()
	credentials := RegisterRequest{Email: "native@example.com", Password: "hunter22", FullName: "Native Runner"}
	registered := readMobileSession(t, mobileRequest(h, "register", credentials, nil), 201)
	session := readMobileSession(t, mobileRequest(h, "login", LoginRequest{Email: credentials.Email, Password: credentials.Password}, nil), 200)
	if session.User.Role != RoleUser {
		t.Fatal("unexpected privilege")
	}
	refreshed := readMobileSession(t, mobileRequest(h, "refresh", map[string]string{"refresh_token": session.RefreshToken}, nil), 200)
	if refreshed.RefreshToken == session.RefreshToken {
		t.Fatal("refresh must rotate")
	}
	if got := mobileRequest(h, "refresh", map[string]string{"refresh_token": session.RefreshToken}, nil); got.Code != 401 {
		t.Fatalf("reuse: %d", got.Code)
	}
	if got := mobileRequest(h, "refresh", nil, &http.Cookie{Name: refreshCookieName, Value: registered.RefreshToken}); got.Code != 401 {
		t.Fatal("native refresh accepted ambient cookie")
	}
	if got := doJSON(web, "POST", "/api/v1/auth/refresh", map[string]string{"refresh_token": registered.RefreshToken}, nil); got.Code != 401 {
		t.Fatal("web refresh accepted native body")
	}
	// A native logout without an explicit token cannot revoke the browser session.
	if got := mobileRequest(h, "logout", nil, &http.Cookie{Name: refreshCookieName, Value: registered.RefreshToken}); got.Code != 400 {
		t.Fatal("native logout accepted cookie")
	}
	readMobileSession(t, mobileRequest(h, "refresh", map[string]string{"refresh_token": registered.RefreshToken}, nil), 200)
	if got := mobileRequest(h, "logout", map[string]string{"refresh_token": refreshed.RefreshToken}, nil); got.Code != 204 {
		t.Fatalf("logout: %d", got.Code)
	}
	if got := mobileRequest(h, "refresh", map[string]string{"refresh_token": refreshed.RefreshToken}, nil); got.Code != 401 {
		t.Fatalf("revoked refresh: %d", got.Code)
	}
	webLogin := doJSON(web, "POST", "/api/v1/auth/login", LoginRequest{Email: credentials.Email, Password: credentials.Password}, nil)
	if bytes.Contains(webLogin.Body.Bytes(), []byte(`"refresh_token"`)) {
		t.Fatal("web response leaked refresh token")
	}
	if len(webLogin.Result().Cookies()) == 0 {
		t.Fatal("web cookie regression")
	}
}
func TestMobileLoginValidationAndLimiter(t *testing.T) {
	h, _ := newTestHandler()
	if got := mobileRequest(h, "login", map[string]string{"email": "bad"}, nil); got.Code != 422 {
		t.Fatal("validation bypass")
	}
	h.loginLimiter = denyingLoginLimiter{}
	rec := mobileRequest(h, "login", LoginRequest{Email: "native@example.com", Password: "hunter22"}, nil)
	if rec.Code != 429 || rec.Header().Get("Retry-After") != "900" {
		t.Fatal("mobile bypassed login limiter")
	}
	if rec.Header().Get("Set-Cookie") != "" {
		t.Fatal("native failure mutated cookies")
	}
}

// Simulate a second consumer winning the conditional revocation after lookup.
type consumedTokenRepo struct{ *fakeAuthRepo }

func (r consumedTokenRepo) RevokeRefreshToken(ctx context.Context, id uuid.UUID, now time.Time) error {
	return ErrNotFound
}
func TestRefreshConsumedDuringRotationIsUnauthorized(t *testing.T) {
	repo := consumedTokenRepo{newFakeAuthRepo()}
	svc := NewService(repo, NewTokenIssuer("test-secret", time.Minute), bcrypt.MinCost, time.Hour)
	result, err := svc.Register(context.Background(), RegisterRequest{Email: "race@example.com", Password: "hunter22", FullName: "Runner"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.Refresh(context.Background(), result.RefreshToken)
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("consumed rotation should be invalid token, got %v", err)
	}
}
