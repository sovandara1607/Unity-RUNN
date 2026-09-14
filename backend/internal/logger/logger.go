// Loggers provides log reports for the system
package logger

import (
	"context"
	"log/slog"
	"os"
)

type ctxKey string

const requestIDKey ctxKey = "request_id"

// logger shows level like (debug, warn, error)
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

// RequestIDFromContext extracts the request ID stored by WithRequestID, returning "" if none is present.
func RequestIDFromContext(ctx context.Context) string {
	v, ok := ctx.Value(requestIDKey).(string)
	if !ok {
		return ""
	}
	return v
}

// FromContext returns a logger enriched with the request ID from ctx, if any. Falls back to the base logger when no request ID is set.
func FromContext(ctx context.Context, base *slog.Logger) *slog.Logger {
	if id := RequestIDFromContext(ctx); id != "" {
		return base.With("request_id", id)
	}
	return base
}

// RequestFields accumulates fields discovered as a request flows through the
// middleware chain, so a value set deep inside the chain (e.g. the
// authenticated user ID, set by auth middleware) can still reach a log line
// written by an outer middleware after the inner handler returns.
//
// This only works because it's stored in the context as a pointer: a plain
// context.WithValue call further down the chain can't propagate back up to
// an outer middleware's own *http.Request variable once next.ServeHTTP
// returns, but mutating the same struct through a shared pointer can.
type RequestFields struct {
	RequestID string
	UserID    string
}

type fieldsCtxKey struct{}

// WithFields returns a context carrying a pointer to fields, so later code
// holding the same context can mutate it (see SetUserID) and have that
// change observed by whoever stored it.
func WithFields(ctx context.Context, fields *RequestFields) context.Context {
	return context.WithValue(ctx, fieldsCtxKey{}, fields)
}

// FieldsFromContext returns the *RequestFields stored by WithFields, or nil
// if none is present (e.g. a context that never passed through the request
// logger, such as in most unit tests).
func FieldsFromContext(ctx context.Context) *RequestFields {
	f, _ := ctx.Value(fieldsCtxKey{}).(*RequestFields)
	return f
}

// SetUserID records the authenticated user ID on the *RequestFields already
// stored in ctx, if any. A no-op when ctx never went through WithFields.
func SetUserID(ctx context.Context, userID string) {
	if f := FieldsFromContext(ctx); f != nil {
		f.UserID = userID
	}
}
