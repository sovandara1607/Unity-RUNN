package adminauth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if IsAdmin(r.Context()) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("admin"))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("anonymous"))
	})
}

func TestRequireAdminKey_ValidKey(t *testing.T) {
	h := RequireAdminKey("s3cret")(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(HeaderName, "s3cret")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if rec.Body.String() != "admin" {
		t.Errorf("body = %q, want %q", rec.Body.String(), "admin")
	}
}

func TestRequireAdminKey_MissingKey(t *testing.T) {
	h := RequireAdminKey("s3cret")(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestRequireAdminKey_WrongKey(t *testing.T) {
	h := RequireAdminKey("s3cret")(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(HeaderName, "wrong")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestWithAdminKey_NoKeyPassesThrough(t *testing.T) {
	h := WithAdminKey("s3cret")(okHandler())

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

func TestWithAdminKey_ValidKeyMarksAdmin(t *testing.T) {
	h := WithAdminKey("s3cret")(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(HeaderName, "s3cret")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Body.String() != "admin" {
		t.Errorf("body = %q, want %q", rec.Body.String(), "admin")
	}
}
