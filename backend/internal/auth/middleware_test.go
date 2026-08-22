package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if u, ok := UserFromContext(r.Context()); ok {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(string(u.Role)))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("anonymous"))
	})
}

func TestRequireAuth_NoToken(t *testing.T) {
	tokens := NewTokenIssuer("secret", time.Hour)
	h := RequireAuth(tokens, RoleUser)(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestRequireAuth_InvalidToken(t *testing.T) {
	tokens := NewTokenIssuer("secret", time.Hour)
	h := RequireAuth(tokens, RoleUser)(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer not-a-real-token")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestRequireAuth_InsufficientRole(t *testing.T) {
	tokens := NewTokenIssuer("secret", time.Hour)
	h := RequireAuth(tokens, RoleAdmin)(okHandler())

	token, _ := tokens.GenerateAccessToken(uuid.New(), RoleUser)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestRequireAuth_SufficientRole(t *testing.T) {
	tokens := NewTokenIssuer("secret", time.Hour)
	h := RequireAuth(tokens, RoleAdmin)(okHandler())

	token, _ := tokens.GenerateAccessToken(uuid.New(), RoleSuperAdmin)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if rec.Body.String() != string(RoleSuperAdmin) {
		t.Errorf("body = %q, want %q", rec.Body.String(), RoleSuperAdmin)
	}
}

func TestOptionalAuth_NoTokenPassesThroughAnonymous(t *testing.T) {
	tokens := NewTokenIssuer("secret", time.Hour)
	h := OptionalAuth(tokens)(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if rec.Body.String() != "anonymous" {
		t.Errorf("body = %q, want %q", rec.Body.String(), "anonymous")
	}
}

func TestOptionalAuth_ValidTokenAttachesUser(t *testing.T) {
	tokens := NewTokenIssuer("secret", time.Hour)
	h := OptionalAuth(tokens)(okHandler())

	token, _ := tokens.GenerateAccessToken(uuid.New(), RoleStaff)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Body.String() != string(RoleStaff) {
		t.Errorf("body = %q, want %q", rec.Body.String(), RoleStaff)
	}
}
