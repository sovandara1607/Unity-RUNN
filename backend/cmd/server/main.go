// Command server is the Unity Run Club API entrypoint. It wires up
// configuration, logging, PostgreSQL/Redis connections, every
// business domain, and the HTTP server.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/unity-run-club/api/internal/admin"
	"github.com/unity-run-club/api/internal/auditlog"
	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/checkin"
	"github.com/unity-run-club/api/internal/config"
	"github.com/unity-run-club/api/internal/database"
	"github.com/unity-run-club/api/internal/email"
	"github.com/unity-run-club/api/internal/events"
	apphttp "github.com/unity-run-club/api/internal/http"
	"github.com/unity-run-club/api/internal/logger"
	"github.com/unity-run-club/api/internal/notifications"
	"github.com/unity-run-club/api/internal/payments"
	"github.com/unity-run-club/api/internal/redisclient"
	"github.com/unity-run-club/api/internal/registrations"
)

// Redis-backed registration tuning. Not exposed as env vars yet — the
// values are conservative defaults; promote to config if a later
// phase needs them tunable per-environment.
const (
	registrationLockTTL    = 5 * time.Second
	availabilityCacheTTL   = 5 * time.Second
	registrationRateLimit  = 5 // attempts
	registrationRateWindow = time.Minute
)

func main() {
	if err := run(); err != nil {
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		// Config isn't loaded yet, so fall back to a minimal logger.
		logger.New("info").Error("startup_failed", "error", err)
		return err
	}

	log := logger.New(cfg.LogLevel)

	connectCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := database.Connect(connectCtx, cfg.DatabaseURL, cfg.DatabaseMaxConn)
	if err != nil {
		log.Error("database_connect_failed", "error", err)
		return err
	}
	defer db.Close()

	redisClient := redisclient.Connect(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	defer func() {
		if err := redisClient.Close(); err != nil {
			log.Error("redis_close_failed", "error", err)
		}
	}()

	tokens := auth.NewTokenIssuer(cfg.JWTSecret, cfg.AccessTokenTTL)
	authRepo := auth.NewRepository(db.Pool)
	authSvc := auth.NewService(authRepo, tokens, cfg.BcryptCost, cfg.RefreshTokenTTL)
	authHandler := auth.NewHandler(authSvc, cfg.RefreshTokenTTL, cfg.AppEnv != "development")

	// notifications wiring comes before events/registrations: both of
	// those define their own notifier interfaces (no import of
	// notifications), and notifications.Service implements them —
	// interface-in-consumer, implementation-in-producer, wired here.
	notifRepo := notifications.NewRepository(db.Pool)
	notifQueue := notifications.NewQueue(redisClient.Raw())
	notifSvc := notifications.NewService(notifRepo, notifQueue, log)

	eventsRepo := events.NewRepository(db.Pool)
	regRepo := registrations.NewRepository(db.Pool)

	eventNotifier := notifications.NewEventNotifier(notifSvc, regRepo, log)
	eventsSvc := events.NewService(eventsRepo, eventNotifier)
	eventsHandler := events.NewHandler(eventsSvc)

	regLocker := registrations.NewLocker(redisClient.Raw(), registrationLockTTL)
	regAvailCache := registrations.NewAvailabilityCache(redisClient.Raw(), availabilityCacheTTL)
	regRateLimiter := registrations.NewRateLimiter(redisClient.Raw(), registrationRateLimit, registrationRateWindow)
	// MockProvider is the only payment provider until a real Cambodian
	// gateway is integrated (see internal/payments.Provider) — it must
	// never run in production.
	if cfg.AppEnv == "production" {
		log.Warn("mock_payment_provider_in_production",
			"detail", "no real payment gateway is wired yet; all paid registrations will auto-succeed")
	}
	paymentProvider := payments.NewMockProvider()
	regNotifier := notifications.NewRegistrationNotifier(notifSvc)
	regSvc := registrations.NewService(regRepo, eventsRepo, paymentProvider, regLocker, regAvailCache, regRateLimiter, regNotifier)
	regHandler := registrations.NewHandler(regSvc)

	auditRepo := auditlog.NewRepository(db.Pool)
	auditSvc := auditlog.NewService(auditRepo, log)

	checkinRepo := checkin.NewRepository(db.Pool)
	checkinSvc := checkin.NewService(checkinRepo, regRepo, auditSvc)
	checkinHandler := checkin.NewHandler(checkinSvc)

	adminHandler := admin.NewHandler(regSvc)

	emailSender := buildEmailSender(cfg, log)
	notifWorker := notifications.NewWorker(notifRepo, notifQueue, regRepo, eventsRepo, emailSender, log,
		cfg.NotificationSweepInterval, cfg.NotificationMaxAttempts)
	reminderScheduler := notifications.NewReminderScheduler(notifSvc, eventsRepo, regRepo, log,
		cfg.ReminderPollInterval, cfg.ReminderWindow)

	backgroundCtx, stopBackground := context.WithCancel(context.Background())
	defer stopBackground()
	go notifWorker.Run(backgroundCtx)
	go reminderScheduler.Run(backgroundCtx)

	router := apphttp.NewRouter(apphttp.Deps{
		Logger:               log,
		DB:                   db,
		Redis:                redisClient,
		CORSAllowedOrigins:   cfg.CORSAllowedOrigins,
		Tokens:               tokens,
		AuthHandler:          authHandler,
		EventsHandler:        eventsHandler,
		RegistrationsHandler: regHandler,
		CheckinHandler:       checkinHandler,
		AdminHandler:         adminHandler,
	})

	srv := apphttp.NewServer(":"+cfg.Port, router)

	serverErrCh := make(chan error, 1)
	go func() {
		log.Info("server_starting", "port", cfg.Port, "app_env", cfg.AppEnv)
		if err := srv.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrCh <- err
			return
		}
		serverErrCh <- nil
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrCh:
		if err != nil {
			log.Error("server_failed", "error", err)
			return err
		}
	case sig := <-quit:
		log.Info("shutdown_signal_received", "signal", sig.String())

		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer shutdownCancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Error("server_shutdown_failed", "error", err)
			return err
		}
		log.Info("shutdown_complete")
	}

	return nil
}

// buildEmailSender returns a real SMTPSender when SMTP is configured,
// or a NoopSender (logs instead of sending) otherwise — same
// dev-safe-default precedent as payments.MockProvider. Production
// without SMTP configured is allowed to start (emails just won't
// send) but logs a warning, same pattern as the mock payment provider.
func buildEmailSender(cfg *config.Config, log *slog.Logger) email.Sender {
	if cfg.SMTPHost == "" {
		if cfg.AppEnv == "production" {
			log.Warn("smtp_not_configured_in_production",
				"detail", "SMTP_HOST is unset; emails will be logged, not sent")
		}
		return email.NewNoopSender(log)
	}

	sender, err := email.NewSMTPSender(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPassword, cfg.SMTPFrom)
	if err != nil {
		log.Error("smtp_sender_init_failed", "error", err)
		return email.NewNoopSender(log)
	}
	return sender
}
