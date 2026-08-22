// Package logger provides structured JSON logging built on log/slog,
// plus small helpers for carrying request-scoped fields (request ID)
// through context so handlers and middleware can log consistently.
package logger

import (
	"context"
	"log/slog"
	"os"
)

type ctxKey string

const requestIDKey ctxKey = "request_id"

// New builds a slog.Logger that writes structured JSON to stdout at
// the given level ("debug", "info", "warn", "error"; defaults to
// "info" for unrecognized values).
func New(level string) *slog.Logger {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLevel(level),
	})
	return slog.New(handler)
}

func parseLevel(level string) slog.Level {
	switch level {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// WithRequestID returns a context carrying the given request ID.
func WithRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, requestIDKey, requestID)
}

// RequestIDFromContext extracts the request ID stored by WithRequestID,
// returning "" if none is present.
func RequestIDFromContext(ctx context.Context) string {
	v, ok := ctx.Value(requestIDKey).(string)
	if !ok {
		return ""
	}
	return v
}

// FromContext returns a logger enriched with the request ID from ctx,
// if any. Falls back to the base logger when no request ID is set.
func FromContext(ctx context.Context, base *slog.Logger) *slog.Logger {
	if id := RequestIDFromContext(ctx); id != "" {
		return base.With("request_id", id)
	}
	return base
}
