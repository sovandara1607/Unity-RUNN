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

	"github.com/unity-run-club/api/internal/adminauth"
	"github.com/unity-run-club/api/internal/events"
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
	AdminAPIKey        string

	EventsHandler *events.Handler

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

	r.Route("/api/v1", func(api chi.Router) {
		api.Route("/events", func(ev chi.Router) {
			// Public reads: WithAdminKey doesn't reject, it only
			// unlocks admin-only visibility (e.g. DRAFT events) when a
			// valid key is presented, so admins can preview via the
			// same endpoints.
			ev.With(adminauth.WithAdminKey(deps.AdminAPIKey)).Get("/", deps.EventsHandler.List)
			ev.With(adminauth.WithAdminKey(deps.AdminAPIKey)).Get("/{slug}", deps.EventsHandler.GetBySlug)

			// Admin writes: key required.
			ev.With(adminauth.RequireAdminKey(deps.AdminAPIKey)).Post("/", deps.EventsHandler.Create)
			ev.With(adminauth.RequireAdminKey(deps.AdminAPIKey)).Patch("/{id}", deps.EventsHandler.Update)
			ev.With(adminauth.RequireAdminKey(deps.AdminAPIKey)).Delete("/{id}", deps.EventsHandler.Delete)
		})
	})

	return r
}
