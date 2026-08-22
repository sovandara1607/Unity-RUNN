// Package middleware provides HTTP middleware shared across the API:
// request ID propagation, panic recovery, CORS, and structured
// per-request access logging.
package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	applogger "github.com/unity-run-club/api/internal/logger"
)

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
