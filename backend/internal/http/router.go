// Package http wires together the HTTP server: middleware, routes,
// and the health/readiness endpoints. Business domain routes are
// registered here; this package owns wiring only, no business logic.
package http

import (
	"context"
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/unity-run-club/api/internal/admin"
	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/checkin"
	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/middleware"
	"github.com/unity-run-club/api/internal/objectstore"
	"github.com/unity-run-club/api/internal/registrations"
	"github.com/unity-run-club/api/internal/siteconfig"
	"github.com/unity-run-club/api/internal/stats"
	"github.com/unity-run-club/api/internal/systemstatus"
)

// Pinger is implemented by any dependency whose health can be checked
// with a context-bound ping (satisfied by *database.DB and
// *redisclient.Client). Using an interface here keeps the router
// testable without a real Postgres/Redis connection.
type Pinger interface {
	Ping(ctx context.Context) error
}

type filesOnlyFS struct{ root http.FileSystem }

func (f filesOnlyFS) Open(name string) (http.File, error) {
	file, err := f.root.Open(name)
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, err
	}
	if info.IsDir() {
		_ = file.Close()
		return nil, fs.ErrNotExist
	}
	return file, nil
}

// Deps holds the dependencies the router needs to build routes.
type Deps struct {
	Logger *slog.Logger
	DB     Pinger
	Redis  Pinger

	CORSAllowedOrigins []string
	UploadDir          string

	Tokens               *auth.TokenIssuer
	AuthHandler          *auth.Handler
	EventsHandler        *events.Handler
	RegistrationsHandler *registrations.Handler
	CheckinHandler       *checkin.Handler
	AdminHandler         *admin.Handler
	StatsHandler         *stats.Handler
	SiteConfigHandler    *siteconfig.Handler
	SystemStatusHandler  *systemstatus.Handler
	MediaHandler         *objectstore.MediaHandler

	// ReadyTimeout bounds how long each dependency ping may take
	// when handling /ready. Defaults to 2s if zero.
	ReadyTimeout time.Duration
}

// NewRouter builds the chi router with global middleware and routes.
func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer(deps.Logger))
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.CORS(deps.CORSAllowedOrigins))
	r.Use(middleware.LimitJSONBody(1 << 20))
	r.Use(middleware.RequestLogger(deps.Logger))

	r.Get("/health", healthHandler)
	r.Get("/ready", readyHandler(deps))
	if deps.UploadDir != "" {
		fileServer := http.FileServer(filesOnlyFS{root: http.Dir(deps.UploadDir)})
		r.Handle("/uploads/*", http.StripPrefix("/uploads/", fileServer))
	}

	r.Route("/api/v1", func(api chi.Router) {
		if deps.MediaHandler != nil {
			api.Get("/media/*", deps.MediaHandler.Get)
		}
		api.Get("/stats", deps.StatsHandler.Summary)
		api.Get("/site-config", deps.SiteConfigHandler.Get)

		api.Route("/auth", func(a chi.Router) {
			a.Get("/providers", deps.AuthHandler.Providers)
			a.Get("/google", deps.AuthHandler.GoogleStart)
			a.Get("/google/callback", deps.AuthHandler.GoogleCallback)
			a.Post("/register", deps.AuthHandler.Register)
			a.Post("/login", deps.AuthHandler.Login)
			a.With(middleware.RequireAllowedOrigin(deps.CORSAllowedOrigins)).Post("/refresh", deps.AuthHandler.Refresh)
			a.With(middleware.RequireAllowedOrigin(deps.CORSAllowedOrigins)).Post("/logout", deps.AuthHandler.Logout)
		})

		api.Route("/me", func(me chi.Router) {
			me.Use(auth.RequireAuth(deps.Tokens, auth.RoleUser))
			me.Get("/", deps.AuthHandler.Me)
			me.Patch("/", deps.AuthHandler.UpdateMe)
			me.Get("/registrations", deps.RegistrationsHandler.ListMine)
		})

		api.Route("/events", func(ev chi.Router) {
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/posters", deps.EventsHandler.UploadPoster)
			// All wildcard segments in this subtree use the same name
			// ({id}) — chi's routing trie requires consistent param
			// names per position; mixing {slug}/{eventId}/{id} here
			// silently 404s deeper static branches.
			// Public reads: OptionalAuth doesn't reject — it only
			// attaches the caller's role when a valid bearer token is
			// present, so STAFF+ can preview non-public events (e.g.
			// DRAFT) via the same endpoints.
			ev.With(auth.OptionalAuth(deps.Tokens)).Get("/", deps.EventsHandler.List)
			ev.With(auth.OptionalAuth(deps.Tokens)).Get("/{id}", deps.EventsHandler.GetBySlug)
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Get("/by-id/{id}", deps.EventsHandler.GetByID)

			// Admin writes: ADMIN role or higher required.
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/", deps.EventsHandler.Create)
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Patch("/{id}", deps.EventsHandler.Update)
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Delete("/{id}", deps.EventsHandler.Delete)

			// Registration & admin sub-resources. Everything under
			// /{id}/categories and /{id}/schedules must live in ONE
			// Route() mount each — registering a deeper path separately
			// (e.g. availability) makes chi unable to route an endpoint
			// mounted directly at /{id}/categories.
			ev.Route("/{id}/categories", func(cat chi.Router) {
				cat.Get("/{categoryId}/availability", deps.RegistrationsHandler.Availability)
				cat.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/", deps.EventsHandler.CreateCategory)
				cat.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Patch("/{categoryId}", deps.EventsHandler.UpdateCategory)
				cat.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Delete("/{categoryId}", deps.EventsHandler.DeleteCategory)
			})
			ev.Route("/{id}/schedules", func(sch chi.Router) {
				sch.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/", deps.EventsHandler.CreateSchedule)
				sch.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Patch("/{scheduleId}", deps.EventsHandler.UpdateSchedule)
				sch.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Delete("/{scheduleId}", deps.EventsHandler.DeleteSchedule)
			})
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleUser)).
				Post("/{id}/registrations", deps.RegistrationsHandler.Register)
		})

		api.Route("/registrations", func(reg chi.Router) {
			reg.Use(auth.RequireAuth(deps.Tokens, auth.RoleUser))
			reg.Get("/{id}", deps.RegistrationsHandler.GetByID)
			reg.Get("/{id}/payment", deps.RegistrationsHandler.Payment)
			reg.Post("/{id}/payment/verify", deps.RegistrationsHandler.VerifyPayment)
			reg.Post("/{id}/cancel", deps.RegistrationsHandler.Cancel)
			reg.Post("/{id}/ticket", deps.RegistrationsHandler.Ticket)
		})

		api.With(auth.RequireAuth(deps.Tokens, auth.RoleStaff)).Post("/check-in", deps.CheckinHandler.CheckIn)

		api.Route("/admin", func(a chi.Router) {
			a.Use(auth.RequireAuth(deps.Tokens, auth.RoleStaff))
			a.Get("/stats", deps.StatsHandler.AdminSummary)
			a.Get("/registrations", deps.AdminHandler.ListRegistrations)
			a.Get("/registrations/{id}", deps.AdminHandler.GetRegistration)
			a.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Get("/audit-logs", deps.AdminHandler.ListAuditLogs)
			a.With(auth.RequireAuth(deps.Tokens, auth.RoleSuperAdmin)).Get("/users", deps.AdminHandler.ListUsers)
			a.With(auth.RequireAuth(deps.Tokens, auth.RoleSuperAdmin)).Patch("/users/{id}/role", deps.AdminHandler.UpdateUserRole)
			a.With(auth.RequireAuth(deps.Tokens, auth.RoleSuperAdmin)).Get("/system", deps.SystemStatusHandler.Get)
			a.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Patch("/site-config", deps.SiteConfigHandler.Update)
			a.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/site-config/assets", deps.SiteConfigHandler.UploadAsset)
			a.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Get("/site-config/versions", deps.SiteConfigHandler.ListVersions)
			a.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/site-config/versions/{versionID}/restore", deps.SiteConfigHandler.RestoreVersion)
		})
	})

	return r
}
