// Package http wires together the HTTP server: middleware, routes,
// and the health/readiness endpoints. Business domain routes are
// registered here in later phases; this phase only exposes /health
// and /ready.
package http

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/unity-run-club/api/internal/middleware"
)

// Pinger is implemented by any dependency whose health can be checked
// with a context-bound ping (satisfied by *database.DB and
// *redisclient.Client). Using an interface here keeps the router
// testable without a real Postgres/Redis connection.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Deps holds the dependencies the router needs to build routes.
type Deps struct {
	Logger *slog.Logger
	DB     Pinger
	Redis  Pinger

	CORSAllowedOrigins []string

	// ReadyTimeout bounds how long each dependency ping may take
	// when handling /ready. Defaults to 2s if zero.
	ReadyTimeout time.Duration
}

// NewRouter builds the chi router with global middleware and routes.
func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer(deps.Logger))
	r.Use(middleware.CORS(deps.CORSAllowedOrigins))
	r.Use(middleware.RequestLogger(deps.Logger))

	r.Get("/health", healthHandler)
	r.Get("/ready", readyHandler(deps))

	return r
}
