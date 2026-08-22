// Package http wires together the HTTP server: middleware, routes,
// and the health/readiness endpoints. Business domain routes are
// registered here; this package owns wiring only, no business logic.
package http

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/unity-run-club/api/internal/auth"
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

	Tokens        *auth.TokenIssuer
	AuthHandler   *auth.Handler
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
		api.Route("/auth", func(a chi.Router) {
			a.Post("/register", deps.AuthHandler.Register)
			a.Post("/login", deps.AuthHandler.Login)
			a.Post("/refresh", deps.AuthHandler.Refresh)
			a.Post("/logout", deps.AuthHandler.Logout)
		})

		api.Route("/me", func(me chi.Router) {
			me.Use(auth.RequireAuth(deps.Tokens, auth.RoleUser))
			me.Get("/", deps.AuthHandler.Me)
			me.Patch("/", deps.AuthHandler.UpdateMe)
		})

		api.Route("/events", func(ev chi.Router) {
			// Public reads: OptionalAuth doesn't reject — it only
			// attaches the caller's role when a valid bearer token is
			// present, so STAFF+ can preview non-public events (e.g.
			// DRAFT) via the same endpoints.
			ev.With(auth.OptionalAuth(deps.Tokens)).Get("/", deps.EventsHandler.List)
			ev.With(auth.OptionalAuth(deps.Tokens)).Get("/{slug}", deps.EventsHandler.GetBySlug)

			// Admin writes: ADMIN role or higher required.
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/", deps.EventsHandler.Create)
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Patch("/{id}", deps.EventsHandler.Update)
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Delete("/{id}", deps.EventsHandler.Delete)
		})
	})

	return r
}
