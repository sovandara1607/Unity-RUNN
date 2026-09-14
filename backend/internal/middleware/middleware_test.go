package middleware

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	applogger "github.com/unity-run-club/api/internal/logger"
)

// TestRequestLogger_CapturesUserIDSetByInnerMiddleware guards the fix for a
// real bug: RequestLogger's own r.WithContext call to add the request ID
// does not, by itself, let a later/inner middleware's context changes (e.g.
// auth attaching the authenticated user) reach RequestLogger's post-handler
// log line, because Go's http.Request context substitution only propagates
// downward through the chain, not back up once next.ServeHTTP returns. The
// fix is a *RequestFields pointer shared via context — this test exercises
// that mechanism end-to-end rather than just the logger package in isolation.
func TestRequestLogger_CapturesUserIDSetByInnerMiddleware(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, nil))

	// Stands in for auth.RequireAuth/OptionalAuth, which call this same helper
	// on successful authentication.
	innerAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			applogger.SetUserID(r.Context(), "user-123")
			next.ServeHTTP(w, r)
		})
	}

	handler := RequestID(RequestLogger(log)(innerAuth(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))

	var logged map[string]any
	if err := json.Unmarshal(buf.Bytes(), &logged); err != nil {
		t.Fatalf("decode log line: %v, raw=%s", err, buf.String())
	}
	if logged["user_id"] != "user-123" {
		t.Fatalf("log user_id = %v, want %q (raw=%s)", logged["user_id"], "user-123", buf.String())
	}
	if logged["request_id"] == nil || logged["request_id"] == "" {
		t.Fatalf("log request_id missing (raw=%s)", buf.String())
	}
}

// TestRequestLogger_OmitsUserIDForAnonymousRequests confirms the fix doesn't
// fabricate a user_id when no auth middleware ever runs (e.g. public routes).
func TestRequestLogger_OmitsUserIDForAnonymousRequests(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, nil))

	handler := RequestID(RequestLogger(log)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))

	var logged map[string]any
	if err := json.Unmarshal(buf.Bytes(), &logged); err != nil {
		t.Fatalf("decode log line: %v, raw=%s", err, buf.String())
	}
	if _, ok := logged["user_id"]; ok {
		t.Fatalf("log unexpectedly has user_id for an anonymous request (raw=%s)", buf.String())
	}
}

func TestSecurityHeaders(t *testing.T) {
	handler := SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/events", nil))

	for name, want := range map[string]string{
		"Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
		"Referrer-Policy":         "no-referrer",
		"X-Content-Type-Options":  "nosniff",
		"X-Frame-Options":         "DENY",
	} {
		if got := rec.Header().Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
}

func TestLimitJSONBodyRejectsKnownOversizeBody(t *testing.T) {
	handler := LimitJSONBody(8)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Fatal("oversized request reached handler")
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(`{"password":"too-long"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestRequireAllowedOrigin(t *testing.T) {
	handler := RequireAllowedOrigin([]string{"https://unity.example"})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	t.Run("allowed browser origin", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req.Header.Set("Origin", "https://unity.example")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
		}
	})

	t.Run("cross-site browser origin", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req.Header.Set("Origin", "https://attacker.example")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
		}
	})

	t.Run("non-browser client", func(t *testing.T) {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil))
		if rec.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
		}
	})
}
