package auth

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func newGoogleTestHandler(t *testing.T) *Handler {
	t.Helper()
	svc, _ := newTestService()
	h := NewHandler(svc, 24*time.Hour, false)
	h.ConfigureGoogle(GoogleOAuthConfig{
		ClientID: "client-id", ClientSecret: "client-secret",
		RedirectURL:  "http://localhost:8080/api/v1/auth/google/callback",
		PublicAppURL: "http://localhost:3000",
	})
	return h
}

func TestGoogleStart_SetsStateAndSafeReturnCookies(t *testing.T) {
	h := newGoogleTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google?redirect=%2F%2Fevil.example", nil)
	rr := httptest.NewRecorder()
	h.GoogleStart(rr, req)
	if rr.Code != http.StatusFound {
		t.Fatalf("status = %d", rr.Code)
	}
	location, err := url.Parse(rr.Header().Get("Location"))
	if err != nil || location.Host != "accounts.google.com" {
		t.Fatalf("unexpected authorization URL %q", rr.Header().Get("Location"))
	}
	if location.Query().Get("state") == "" || location.Query().Get("scope") != "openid email profile" {
		t.Fatalf("authorization query missing security parameters: %s", location.RawQuery)
	}
	cookies := rr.Result().Cookies()
	var returnCookie *http.Cookie
	for _, cookie := range cookies {
		if cookie.Name == googleReturnCookieName {
			returnCookie = cookie
		}
	}
	if returnCookie == nil || returnCookie.Value != "/dashboard" || !returnCookie.HttpOnly || returnCookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("unsafe return cookie: %#v", returnCookie)
	}
}

func TestGoogleCallback_RejectsMismatchedStateBeforeExchange(t *testing.T) {
	h := newGoogleTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/callback?state=wrong&code=unused", nil)
	req.AddCookie(&http.Cookie{Name: googleStateCookieName, Value: "expected"})
	rr := httptest.NewRecorder()
	h.GoogleCallback(rr, req)
	if rr.Code != http.StatusFound {
		t.Fatalf("status = %d", rr.Code)
	}
	if location := rr.Header().Get("Location"); !strings.Contains(location, "/auth/login?oauth_error=invalid_state") {
		t.Fatalf("redirect = %q", location)
	}
}

func TestGoogleStart_MobilePlatform_SetsMobileCookie(t *testing.T) {
	h := newGoogleTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google?platform=mobile", nil)
	rr := httptest.NewRecorder()
	h.GoogleStart(rr, req)

	var mobileCookie *http.Cookie
	for _, cookie := range rr.Result().Cookies() {
		if cookie.Name == googleMobileCookieName {
			mobileCookie = cookie
		}
	}
	if mobileCookie == nil || mobileCookie.Value != "1" {
		t.Fatalf("expected %s=1 cookie, got %#v", googleMobileCookieName, mobileCookie)
	}
}

func TestGoogleStart_WebPlatform_NoMobileCookie(t *testing.T) {
	h := newGoogleTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google", nil)
	rr := httptest.NewRecorder()
	h.GoogleStart(rr, req)

	for _, cookie := range rr.Result().Cookies() {
		if cookie.Name == googleMobileCookieName {
			t.Fatalf("did not expect %s cookie on a web-platform start", googleMobileCookieName)
		}
	}
}

func TestGoogleCallback_Mobile_RejectsMismatchedState_RedirectsToDeepLink(t *testing.T) {
	h := newGoogleTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/callback?state=wrong&code=unused", nil)
	req.AddCookie(&http.Cookie{Name: googleStateCookieName, Value: "expected"})
	req.AddCookie(&http.Cookie{Name: googleMobileCookieName, Value: "1"})
	rr := httptest.NewRecorder()
	h.GoogleCallback(rr, req)

	location := rr.Header().Get("Location")
	if !strings.HasPrefix(location, mobileDeepLinkRedirect) {
		t.Fatalf("redirect = %q, want it to start with %q", location, mobileDeepLinkRedirect)
	}
	if !strings.Contains(location, "error=invalid_state") {
		t.Fatalf("redirect = %q, want an invalid_state error", location)
	}
}

func TestMobileGoogleCallback_Unconfigured(t *testing.T) {
	h := newGoogleTestHandler(t) // ConfigureGoogleMobile was never called — nil mobileCodes
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/mobile/google/callback", strings.NewReader(`{"code":"anything"}`))
	rr := httptest.NewRecorder()
	h.MobileGoogleCallback(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 when mobile Google sign-in is unconfigured", rr.Code)
	}
}

func TestMobileGoogleCallback_MissingCode(t *testing.T) {
	h := newGoogleTestHandler(t)
	h.ConfigureGoogleMobile(redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"})) // never dialed; request fails validation first
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/mobile/google/callback", strings.NewReader(`{"code":""}`))
	rr := httptest.NewRecorder()
	h.MobileGoogleCallback(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for an empty code", rr.Code)
	}
}

func TestSafeReturnPath(t *testing.T) {
	for input, want := range map[string]string{
		"/dashboard": "/dashboard", "/admin/events?tab=open": "/admin/events?tab=open",
		"//evil.example": "/dashboard", "/\\evil.example": "/dashboard",
		"https://evil.example": "/dashboard", "": "/dashboard",
	} {
		if got := safeReturnPath(input); got != want {
			t.Errorf("safeReturnPath(%q) = %q, want %q", input, got, want)
		}
	}
}
