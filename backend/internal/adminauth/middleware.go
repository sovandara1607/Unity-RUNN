// Package adminauth is a temporary stand-in for real authentication
// and RBAC (arriving in a later phase). It gates admin write
// endpoints with a single static API key compared via constant-time
// equality, and separately lets read endpoints detect "is this an
// admin caller" to relax visibility rules (e.g. seeing DRAFT events).
//
// This is NOT a substitute for per-user roles — it grants the same
// full access to anyone holding the key. Replace with session/JWT +
// RBAC in the auth phase.
package adminauth

import (
	"context"
	"crypto/subtle"
	"net/http"
)

type ctxKey string

const adminCtxKey ctxKey = "admin_authenticated"

// HeaderName is the header callers must set with the admin API key.
const HeaderName = "X-Admin-Key"

// RequireAdminKey rejects requests (401) unless X-Admin-Key matches
// expectedKey exactly. On success it also marks the request as admin
// via context, same as WithAdminKey.
func RequireAdminKey(expectedKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !keyMatches(r, expectedKey) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":{"code":"unauthorized","message":"missing or invalid admin key"}}`))
				return
			}
			ctx := context.WithValue(r.Context(), adminCtxKey, true)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// WithAdminKey does NOT reject requests — it only marks the request
// as admin (via context) when a valid key is present, letting public
// GET routes optionally show admin-only data without requiring the
// key on every read.
func WithAdminKey(expectedKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if keyMatches(r, expectedKey) {
				ctx := context.WithValue(r.Context(), adminCtxKey, true)
				r = r.WithContext(ctx)
			}
			next.ServeHTTP(w, r)
		})
	}
}

// IsAdmin reports whether ctx was marked admin by RequireAdminKey or
// WithAdminKey.
func IsAdmin(ctx context.Context) bool {
	v, _ := ctx.Value(adminCtxKey).(bool)
	return v
}

func keyMatches(r *http.Request, expectedKey string) bool {
	if expectedKey == "" {
		return false
	}
	got := r.Header.Get(HeaderName)
	if got == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(expectedKey)) == 1
}
