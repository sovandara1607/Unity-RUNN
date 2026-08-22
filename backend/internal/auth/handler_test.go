package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

func newTestHandler() (*Handler, http.Handler) {
	repo := newFakeAuthRepo()
	tokens := NewTokenIssuer("test-secret", 15*time.Minute)
	svc := NewService(repo, tokens, bcrypt.MinCost, 24*time.Hour)
	h := NewHandler(svc, 24*time.Hour, false)

	r := chi.NewRouter()
	r.Route("/api/v1/auth", func(a chi.Router) {
		a.Post("/register", h.Register)
		a.Post("/login", h.Login)
		a.Post("/refresh", h.Refresh)
		a.Post("/logout", h.Logout)
	})
	r.With(RequireAuth(tokens, RoleUser)).Get("/api/v1/me", h.Me)

	return h, r
}

func doJSON(router http.Handler, method, path string, body any, cookies []*http.Cookie) *httptest.ResponseRecorder {
	var reader *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestAuthFlow_RegisterLoginRefreshLogout(t *testing.T) {
	_, router := newTestHandler()

	// Register.
	regRec := doJSON(router, http.MethodPost, "/api/v1/auth/register", RegisterRequest{
		Email: "runner@unityrunclub.com", Password: "hunter22", FullName: "Test Runner",
	}, nil)
	if regRec.Code != http.StatusCreated {
		t.Fatalf("register status = %d, want %d, body=%s", regRec.Code, http.StatusCreated, regRec.Body.String())
	}
	regCookies := regRec.Result().Cookies()
	if len(regCookies) == 0 {
		t.Fatal("expected a refresh_token cookie after register")
	}

	// Login.
	loginRec := doJSON(router, http.MethodPost, "/api/v1/auth/login", LoginRequest{
		Email: "runner@unityrunclub.com", Password: "hunter22",
	}, nil)
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login status = %d, want %d, body=%s", loginRec.Code, http.StatusOK, loginRec.Body.String())
	}
	var loginBody struct {
		Data authResponse `json:"data"`
	}
	if err := json.Unmarshal(loginRec.Body.Bytes(), &loginBody); err != nil {
		t.Fatalf("decode login body: %v", err)
	}
	if loginBody.Data.AccessToken == "" {
		t.Fatal("expected non-empty access token from login")
	}
	loginCookies := loginRec.Result().Cookies()

	// GET /me with the access token.
	meReq := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+loginBody.Data.AccessToken)
	meRec := httptest.NewRecorder()
	router.ServeHTTP(meRec, meReq)
	if meRec.Code != http.StatusOK {
		t.Fatalf("me status = %d, want %d, body=%s", meRec.Code, http.StatusOK, meRec.Body.String())
	}

	// Refresh using the login refresh cookie.
	refreshRec := doJSON(router, http.MethodPost, "/api/v1/auth/refresh", nil, loginCookies)
	if refreshRec.Code != http.StatusOK {
		t.Fatalf("refresh status = %d, want %d, body=%s", refreshRec.Code, http.StatusOK, refreshRec.Body.String())
	}
	newCookies := refreshRec.Result().Cookies()

	// Reusing the old (rotated-out) refresh cookie must fail.
	reuseRec := doJSON(router, http.MethodPost, "/api/v1/auth/refresh", nil, loginCookies)
	if reuseRec.Code != http.StatusUnauthorized {
		t.Fatalf("reused refresh status = %d, want %d, body=%s", reuseRec.Code, http.StatusUnauthorized, reuseRec.Body.String())
	}

	// Logout with the current cookie.
	logoutRec := doJSON(router, http.MethodPost, "/api/v1/auth/logout", nil, newCookies)
	if logoutRec.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d, want %d, body=%s", logoutRec.Code, http.StatusNoContent, logoutRec.Body.String())
	}

	// The logged-out cookie should no longer refresh.
	postLogoutRec := doJSON(router, http.MethodPost, "/api/v1/auth/refresh", nil, newCookies)
	if postLogoutRec.Code != http.StatusUnauthorized {
		t.Fatalf("post-logout refresh status = %d, want %d, body=%s", postLogoutRec.Code, http.StatusUnauthorized, postLogoutRec.Body.String())
	}
}

func TestHandler_Register_DuplicateEmail(t *testing.T) {
	_, router := newTestHandler()

	req := RegisterRequest{Email: "runner@unityrunclub.com", Password: "hunter22", FullName: "Test Runner"}
	doJSON(router, http.MethodPost, "/api/v1/auth/register", req, nil)

	rec := doJSON(router, http.MethodPost, "/api/v1/auth/register", req, nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
}

func TestHandler_Register_ValidationFailure(t *testing.T) {
	_, router := newTestHandler()

	rec := doJSON(router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "not-an-email", "password": "short",
	}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnprocessableEntity, rec.Body.String())
	}
}

func TestHandler_Login_WrongPassword(t *testing.T) {
	_, router := newTestHandler()

	doJSON(router, http.MethodPost, "/api/v1/auth/register", RegisterRequest{
		Email: "runner@unityrunclub.com", Password: "hunter22", FullName: "Test Runner",
	}, nil)

	rec := doJSON(router, http.MethodPost, "/api/v1/auth/login", LoginRequest{
		Email: "runner@unityrunclub.com", Password: "wrong-password",
	}, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}
}

func TestHandler_Me_RequiresAuth(t *testing.T) {
	_, router := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}
}
