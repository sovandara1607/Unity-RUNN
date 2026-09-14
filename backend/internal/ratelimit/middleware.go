package ratelimit

import (
	"net/http"
	"strconv"
	"time"

	"github.com/unity-run-club/api/internal/httpresponse"
)

// KeyFunc derives the rate-limit key for a request (e.g. by client IP or by
// authenticated user ID).
type KeyFunc func(r *http.Request) string

// Middleware returns chi middleware that rejects requests over limit per
// window, keyed by keyFunc, with a 429 and a Retry-After header. Consistent
// with the package's fail-open behavior, a Redis error lets the request
// through rather than blocking traffic during an outage.
func Middleware(limiter *Limiter, keyFunc KeyFunc, limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			allowed, err := limiter.Allow(r.Context(), keyFunc(r), limit, window)
			if err == nil && !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(int(window.Seconds())))
				httpresponse.WriteError(w, http.StatusTooManyRequests, "rate_limited", "too many requests, try again later")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
