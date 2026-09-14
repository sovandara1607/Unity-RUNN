package http

import (
	"context"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/unity-run-club/api/internal/admin"
	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/checkin"
	"github.com/unity-run-club/api/internal/eventautomations"
	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/liveactivities"
	"github.com/unity-run-club/api/internal/middleware"
	"github.com/unity-run-club/api/internal/notifications"
	"github.com/unity-run-club/api/internal/objectstore"
	"github.com/unity-run-club/api/internal/ratelimit"
	"github.com/unity-run-club/api/internal/registrations"
	"github.com/unity-run-club/api/internal/siteconfig"
	"github.com/unity-run-club/api/internal/stats"
	"github.com/unity-run-club/api/internal/systemstatus"
	"github.com/unity-run-club/api/internal/telegram"
)

// Pinger is implemented by any dependency whose health can be checked with a context-bound ping (satisfied by *database.DB and *redisclient.Client). Using an interface here keeps the router testable without a real Postgres/Redis connection
type Pinger interface {
	Ping(ctx context.Context) error
}

// filesOnlyFS is a http.FileSystem that only serves files from the root directory
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

// Deps holds the dependencies the router needs to build routes
type Deps struct {
	Logger *slog.Logger
	DB     Pinger
	Redis  Pinger

	CORSAllowedOrigins []string
	UploadDir          string

	Tokens                  *auth.TokenIssuer
	AuthHandler             *auth.Handler
	EventsHandler           *events.Handler
	RegistrationsHandler    *registrations.Handler
	LiveActivitiesHandler   *liveactivities.Handler
	CheckinHandler          *checkin.Handler
	AdminHandler            *admin.Handler
	StatsHandler            *stats.Handler
	SiteConfigHandler       *siteconfig.Handler
	SystemStatusHandler     *systemstatus.Handler
	MediaHandler            *objectstore.MediaHandler
	TelegramHandler         *telegram.Handler
	AutomationHandler       *notifications.AdminHandler
	EventAutomationsHandler *eventautomations.Handler

	// RateLimiter, EventsReadRateLimit and PaymentVerifyRateLimit configure
	// the path-based rate limits applied to public event reads and payment
	// verification. RateLimiter may be nil (e.g. in tests), in which case
	// these limits are skipped entirely.
	RateLimiter                  *ratelimit.Limiter
	EventsReadRateLimitMax       int
	EventsReadRateLimitWindow    time.Duration
	PaymentVerifyRateLimitMax    int
	PaymentVerifyRateLimitWindow time.Duration

	// ReadyTimeout bounds how long each dependency ping may take when handling /ready. Defaults to 2 seconds if zero
	ReadyTimeout time.Duration
}

// byIP keys a rate limit by client IP. Traefik appends the immediate peer's
// address to any inbound X-Forwarded-For, so the first entry is the original
// client IP *only if* Traefik is configured to trust the upstream (e.g. via
// entryPoints.*.forwardedHeaders.trustedIPs for Cloudflare's ranges) —
// without that, every request looks like it comes from Traefik itself,
// collapsing this into one shared bucket. See docs/scaling.md.
func byIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		if i := strings.IndexByte(fwd, ','); i >= 0 {
			fwd = fwd[:i]
		}
		if ip := strings.TrimSpace(fwd); ip != "" {
			return "ratelimit:ip:" + ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return "ratelimit:ip:" + host
}

// byUser keys a rate limit by the authenticated caller, for routes that
// already sit behind auth.RequireAuth.
func byUser(r *http.Request) string {
	if u, ok := auth.UserFromContext(r.Context()); ok {
		return "ratelimit:user:" + u.ID.String()
	}
	return "ratelimit:anon"
}

// noopMiddleware passes every request through unchanged — used when a rate
// limit isn't configured (e.g. deps.RateLimiter is nil in tests).
func noopMiddleware(next http.Handler) http.Handler { return next }

func eventsReadRateLimit(deps Deps) func(http.Handler) http.Handler {
	if deps.RateLimiter == nil {
		return noopMiddleware
	}
	return ratelimit.Middleware(deps.RateLimiter, byIP, deps.EventsReadRateLimitMax, deps.EventsReadRateLimitWindow)
}

func paymentVerifyRateLimit(deps Deps) func(http.Handler) http.Handler {
	if deps.RateLimiter == nil {
		return noopMiddleware
	}
	return ratelimit.Middleware(deps.RateLimiter, byUser, deps.PaymentVerifyRateLimitMax, deps.PaymentVerifyRateLimitWindow)
}

// NewRouter builds the chi router with global middleware and routes
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
		if deps.TelegramHandler != nil {
			api.Post("/integrations/telegram/webhook", deps.TelegramHandler.Webhook)
		}

		api.Route("/auth", func(a chi.Router) {
			a.Get("/providers", deps.AuthHandler.Providers)
			// Explicit native transport shares the auth service; cookies are ignored.
			a.Route("/mobile", func(m chi.Router) {
				m.Use(middleware.RequireAllowedOrigin(deps.CORSAllowedOrigins))
				m.Post("/register", deps.AuthHandler.MobileRegister)
				m.Post("/login", deps.AuthHandler.MobileLogin)
				m.Post("/google/callback", deps.AuthHandler.MobileGoogleCallback)
				m.Post("/google", deps.AuthHandler.MobileGoogleSignIn)
				m.Post("/refresh", deps.AuthHandler.MobileRefresh)
				m.Post("/logout", deps.AuthHandler.MobileLogout)
			})
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
			if deps.TelegramHandler != nil {
				me.Get("/telegram", deps.TelegramHandler.Status)
				me.Post("/telegram/link", deps.TelegramHandler.CreateLink)
				me.Patch("/telegram/preferences", deps.TelegramHandler.UpdatePreferences)
				me.Post("/telegram/test", deps.TelegramHandler.SendTest)
				me.Get("/telegram/deliveries", deps.TelegramHandler.Deliveries)
				me.Delete("/telegram", deps.TelegramHandler.Disconnect)
			}
		})

		api.Route("/events", func(ev chi.Router) {
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/posters", deps.EventsHandler.UploadPoster)
			// Public reads: OptionalAuth doesn't reject, it only attaches the caller's role when a valid bearer token is present, so STAFF+ can preview non-public events
			eventsReadLimit := eventsReadRateLimit(deps)
			ev.With(auth.OptionalAuth(deps.Tokens), eventsReadLimit).Get("/", deps.EventsHandler.List)
			ev.With(auth.OptionalAuth(deps.Tokens), eventsReadLimit).Get("/{id}", deps.EventsHandler.GetBySlug)
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Get("/by-id/{id}", deps.EventsHandler.GetByID)

			// Admin writes: Admin role or higher required
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/", deps.EventsHandler.Create)
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/{id}/duplicate", deps.EventsHandler.Duplicate)
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Patch("/{id}", deps.EventsHandler.Update)
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Delete("/{id}", deps.EventsHandler.Delete)

			// Registration & admin sub-resources, everything under /{id}/categories and /{id}/schedules must live in ONE Route() mount each — registering a deeper path separately (e.g. availability) makes chi unable to route an endpoint mounted directly at /{id}/cate
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
			ev.Route("/{id}/faqs", func(faq chi.Router) {
				faq.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/", deps.EventsHandler.CreateFAQ)
				faq.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Patch("/{faqId}", deps.EventsHandler.UpdateFAQ)
				faq.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Delete("/{faqId}", deps.EventsHandler.DeleteFAQ)
			})
			ev.Route("/{id}/rules", func(rule chi.Router) {
				rule.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/", deps.EventsHandler.CreateRule)
				rule.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Patch("/{ruleId}", deps.EventsHandler.UpdateRule)
				rule.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Delete("/{ruleId}", deps.EventsHandler.DeleteRule)
			})
			if deps.EventAutomationsHandler != nil {
				ev.Route("/{id}/automations", func(automation chi.Router) {
					automation.Use(auth.RequireAuth(deps.Tokens, auth.RoleAdmin))
					automation.Get("/", deps.EventAutomationsHandler.List)
					automation.Post("/", deps.EventAutomationsHandler.Create)
					automation.Patch("/{automationId}", deps.EventAutomationsHandler.Update)
					automation.Delete("/{automationId}", deps.EventAutomationsHandler.Cancel)
				})
			}
			ev.With(auth.RequireAuth(deps.Tokens, auth.RoleUser)).
				Post("/{id}/registrations", deps.RegistrationsHandler.Register)
		})
		// Registrations & admin sub-resources, everything under /registrations must live in ONE Route() mount each — registering a deeper path separately (e.g. availability) makes chi unable to route an endpoint mounted directly at /registrations

		api.Route("/registrations", func(reg chi.Router) {
			reg.Use(auth.RequireAuth(deps.Tokens, auth.RoleUser))
			reg.Get("/{id}", deps.RegistrationsHandler.GetByID)
			reg.Get("/{id}/payment", deps.RegistrationsHandler.Payment)
			reg.With(paymentVerifyRateLimit(deps)).Post("/{id}/payment/verify", deps.RegistrationsHandler.VerifyPayment)
			reg.Post("/{id}/cancel", deps.RegistrationsHandler.Cancel)
			reg.Post("/{id}/ticket", deps.RegistrationsHandler.Ticket)
		})

		api.Route("/live-activities", func(la chi.Router) {
			la.Use(auth.RequireAuth(deps.Tokens, auth.RoleUser))
			la.Get("/", deps.LiveActivitiesHandler.ListMine)
			la.Post("/", deps.LiveActivitiesHandler.Create)
			la.Patch("/{id}", deps.LiveActivitiesHandler.Update)
			la.Delete("/{id}", deps.LiveActivitiesHandler.End)
		})

		api.With(auth.RequireAuth(deps.Tokens, auth.RoleStaff)).Post("/check-in", deps.CheckinHandler.CheckIn)
		// Check-in & admin sub-resources, everything under /admin must live in ONE Route() mount each
		api.Route("/admin", func(a chi.Router) {
			a.Use(auth.RequireAuth(deps.Tokens, auth.RoleStaff))
			a.Get("/stats", deps.StatsHandler.AdminSummary)
			a.Get("/registrations", deps.AdminHandler.ListRegistrations)
			a.Get("/registrations/export.csv", deps.AdminHandler.ExportRegistrations)
			a.Get("/registrations/{id}", deps.AdminHandler.GetRegistration)
			a.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Get("/audit-logs", deps.AdminHandler.ListAuditLogs)
			if deps.AutomationHandler != nil {
				a.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Get("/automations", deps.AutomationHandler.Snapshot)
				a.With(auth.RequireAuth(deps.Tokens, auth.RoleAdmin)).Post("/automations/deliveries/{id}/retry", deps.AutomationHandler.Retry)
			}
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
