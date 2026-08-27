package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/httpresponse"
)

type ctxKey string

const userCtxKey ctxKey = "authenticated_user"

// AuthenticatedUser is what request-scoped context carries about the caller once a valid access token has been presented
type AuthenticatedUser struct {
	ID   uuid.UUID
	Role Role
}

// UserFromContext extracts the AuthenticatedUser set by RequireAuth or OptionalAuth, if any
func UserFromContext(ctx context.Context) (*AuthenticatedUser, bool) {
	u, ok := ctx.Value(userCtxKey).(*AuthenticatedUser)
	return u, ok
}

// RequireAuth rejects requests (401) unless a valid "Authorization: Bearer <token>" header is present, and (403) unless the caller's role is at least minRole. On success it attaches the AuthenticatedUser to context
func RequireAuth(tokens *TokenIssuer, minRole Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, err := parseBearer(r, tokens)
			if err != nil {
				httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
				return
			}
			if !claims.Role.AtLeast(minRole) {
				httpresponse.WriteError(w, http.StatusForbidden, "forbidden", "insufficient role for this action")
				return
			}

			u := &AuthenticatedUser{ID: claims.UserID, Role: claims.Role}
			ctx := context.WithValue(r.Context(), userCtxKey, u)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// OptionalAuth attaches an AuthenticatedUser to context when a valid bearer token is present, but never rejects the request — lets public GET routes relax visibility for STAFF+ callers without requiring auth on every read
func OptionalAuth(tokens *TokenIssuer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if claims, err := parseBearer(r, tokens); err == nil {
				u := &AuthenticatedUser{ID: claims.UserID, Role: claims.Role}
				r = r.WithContext(context.WithValue(r.Context(), userCtxKey, u))
			}
			next.ServeHTTP(w, r)
		})
	}
}

func parseBearer(r *http.Request, tokens *TokenIssuer) (*Claims, error) {
	header := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return nil, ErrInvalidToken
	}
	raw := strings.TrimPrefix(header, prefix)
	return tokens.ParseAccessToken(raw)
}
