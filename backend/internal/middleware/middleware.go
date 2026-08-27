// Package middleware provides HTTP middleware shared across the API:
// request ID propagation, panic recovery, CORS, and structured
// per-request access logging.
package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	applogger "github.com/unity-run-club/api/internal/logger"
)

// SecurityHeaders applies conservative response headers to every API and
// upload response. The API is never intended to render executable HTML.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

// LimitJSONBody caps JSON request bodies before handlers decode them. Uploads
// have their own stricter multipart limit in the events handler.
func LimitJSONBody(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil && strings.Contains(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
				if r.ContentLength > maxBytes {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusRequestEntityTooLarge)
					_, _ = w.Write([]byte(`{"error":{"code":"body_too_large","message":"request body is too large"}}`))
					return
				}
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireAllowedOrigin blocks browser cross-site requests that can carry the
// refresh-token cookie. Requests without Origin remain available to trusted
// non-browser clients and local operational tooling.
func RequireAllowedOrigin(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		origin = strings.TrimRight(strings.TrimSpace(origin), "/")
		if origin != "" {
			allowed[origin] = struct{}{}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")
			if origin != "" {
				if _, ok := allowed[origin]; !ok {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					_, _ = w.Write([]byte(`{"error":{"code":"invalid_origin","message":"request origin is not allowed"}}`))
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequestID assigns/propagates an X-Request-ID header and makes it
// available via chi's request ID context (which our logger helpers
// read through logger.FromContext after RequestLogger stores it).
func RequestID(next http.Handler) http.Handler {
	return chimiddleware.RequestID(next)
}

// RequestLogger logs one structured line per request: method, path,
// status, duration, and request ID.
func RequestLogger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)

			reqID := chimiddleware.GetReqID(r.Context())
			ctx := applogger.WithRequestID(r.Context(), reqID)
			r = r.WithContext(ctx)

			next.ServeHTTP(ww, r)

			applogger.FromContext(r.Context(), log).Info("http_request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"bytes", ww.BytesWritten(),
				"duration_ms", time.Since(start).Milliseconds(),
				"remote_addr", r.RemoteAddr,
			)
		})
	}
}

// Recoverer recovers from panics in downstream handlers, logs the
// panic with a stack trace, and returns a 500 JSON error instead of
// crashing the process.
func Recoverer(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					applogger.FromContext(r.Context(), log).Error("panic_recovered",
						"error", rec,
						"stack", string(debug.Stack()),
						"path", r.URL.Path,
					)
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusInternalServerError)
					_, _ = w.Write([]byte(`{"error":"internal_server_error"}`))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// CORS builds a CORS middleware allowing only the configured origins.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	return cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	})
}
