package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"

	"github.com/unity-run-club/api/internal/admin"
	"github.com/unity-run-club/api/internal/auditlog"
	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/checkin"
	"github.com/unity-run-club/api/internal/config"
	"github.com/unity-run-club/api/internal/database"
	"github.com/unity-run-club/api/internal/email"
	"github.com/unity-run-club/api/internal/eventautomations"
	"github.com/unity-run-club/api/internal/events"
	apphttp "github.com/unity-run-club/api/internal/http"
	"github.com/unity-run-club/api/internal/idempotency"
	"github.com/unity-run-club/api/internal/liveactivities"
	"github.com/unity-run-club/api/internal/logger"
	"github.com/unity-run-club/api/internal/metrics"
	"github.com/unity-run-club/api/internal/notifications"
	"github.com/unity-run-club/api/internal/objectstore"
	"github.com/unity-run-club/api/internal/payments"
	"github.com/unity-run-club/api/internal/ratelimit"
	"github.com/unity-run-club/api/internal/realtime"
	"github.com/unity-run-club/api/internal/redisclient"
	"github.com/unity-run-club/api/internal/registrations"
	"github.com/unity-run-club/api/internal/siteconfig"
	"github.com/unity-run-club/api/internal/stats"
	"github.com/unity-run-club/api/internal/systemstatus"
	"github.com/unity-run-club/api/internal/telegram"
)

// Redis-backed registration tuning.
const (
	registrationLockTTL  = 5 * time.Second
	availabilityCacheTTL = 5 * time.Second
	telegramDeliveryPoll = 5 * time.Second
)

func main() {
	if err := run(); err != nil {
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		logger.New("info").Error("startup_failed", "error", err)
		return err
	}

	log := logger.New(cfg.LogLevel)
	metrics.MustRegister()

	connectCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := database.Connect(connectCtx, cfg.DatabaseURL, database.Options{
		MaxConns:        cfg.DatabaseMaxConn,
		MinConns:        cfg.DatabaseMinConn,
		MaxConnLifetime: cfg.DatabaseMaxConnLifetime,
		MaxConnIdleTime: cfg.DatabaseMaxConnIdleTime,
		PgBouncerCompat: cfg.DatabasePgBouncerCompat,
	})
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
	loginLimiter := auth.NewRedisAttemptLimiter(redisClient.Raw(), cfg.RateLimitLoginMax, cfg.RateLimitLoginWindow)
	authHandler := auth.NewHandler(authSvc, cfg.RefreshTokenTTL, cfg.AppEnv != "development", loginLimiter)
	authHandler.ConfigureGoogle(auth.GoogleOAuthConfig{
		ClientID: cfg.GoogleOAuthClientID, ClientSecret: cfg.GoogleOAuthClientSecret,
		RedirectURL: cfg.GoogleOAuthRedirectURL, PublicAppURL: cfg.PublicAppURL,
	})
	authHandler.ConfigureGoogleMobile(redisClient.Raw())

	notifRepo := notifications.NewRepository(db.Pool)
	notifQueue := notifications.NewQueue(redisClient.Raw())
	notifSvc := notifications.NewService(notifRepo, notifQueue, log)

	eventsRepo := events.NewRepository(db.Pool)
	regRepo := registrations.NewRepository(db.Pool)
	uploadStore := objectstore.Store(objectstore.NewLocal(cfg.UploadDir, "/uploads"))
	var mediaHandler *objectstore.MediaHandler
	if cfg.ObjectStorageProvider == "r2" {
		r2Store, err := objectstore.NewR2(
			cfg.R2Endpoint,
			cfg.R2AccessKeyID,
			cfg.R2SecretAccessKey,
			cfg.R2Bucket,
			cfg.R2PublicBaseURL,
		)
		if err != nil {
			log.Error("object_storage_init_failed", "provider", "r2", "error", err)
			return err
		}
		uploadStore = r2Store
		mediaHandler = objectstore.NewMediaHandler(r2Store)
	}

	// Constructed here (rather than down by siteConfigSvc, where it used to
	// live) so events.NewService and registrations.NewService below can share
	// the same instance -- one Redis client, one publisher, three consumers.
	realtimePublisher := realtime.NewPublisher(redisClient.Raw(), log)

	eventNotifier := notifications.NewEventNotifier(notifSvc, regRepo, log)
	eventsSvc := events.NewService(eventsRepo, eventNotifier, realtimePublisher)
	eventsHandler := events.NewHandlerWithStore(eventsSvc, uploadStore)

	regLocker := registrations.NewLocker(redisClient.Raw(), registrationLockTTL)
	regAvailCache := registrations.NewAvailabilityCache(redisClient.Raw(), availabilityCacheTTL)
	regRateLimiter := registrations.NewRateLimiter(redisClient.Raw(), cfg.RateLimitRegistrationMax, cfg.RateLimitRegistrationWindow)
	sharedRateLimiter := ratelimit.NewLimiter(redisClient.Raw())
	if cfg.AppEnv == "production" && cfg.PaymentProvider == "mock" {
		return errors.New("PAYMENT_PROVIDER=mock is not allowed in production")
	}
	paymentProvider, err := buildPaymentProvider(cfg)
	if err != nil {
		log.Error("payment_provider_init_failed", "provider", cfg.PaymentProvider, "error", err)
		return err
	}
	regNotifier := notifications.NewRegistrationNotifier(notifSvc)
	idemRepo := idempotency.NewRepository(db.Pool)
	idemSvc := idempotency.NewService(idemRepo)
	regSvc := registrations.NewService(regRepo, eventsRepo, paymentProvider, regLocker, regAvailCache, regRateLimiter, regNotifier, idemSvc, db.Pool, realtimePublisher)
	regHandler := registrations.NewHandler(regSvc)

	// No Publisher wired yet -- see internal/liveactivities package doc comment.
	// Rows are recorded, nothing is pushed to APNs until real credentials exist.
	liveActivitiesRepo := liveactivities.NewRepository(db.Pool)
	liveActivitiesSvc := liveactivities.NewService(liveActivitiesRepo, nil)
	liveActivitiesHandler := liveactivities.NewHandler(liveActivitiesSvc)

	auditRepo := auditlog.NewRepository(db.Pool)
	auditSvc := auditlog.NewService(auditRepo, log)

	checkinRepo := checkin.NewRepository(db.Pool)
	checkinSvc := checkin.NewService(checkinRepo, regRepo, auditSvc)
	checkinHandler := checkin.NewHandler(checkinSvc)

	adminHandler := admin.NewHandler(regSvc, auditRepo, authSvc, auditSvc)
	statsHandler := stats.NewHandler(stats.NewRepository(db.Pool))
	siteConfigSvc := siteconfig.NewService(siteconfig.NewRepository(db.Pool), realtimePublisher)
	siteConfigHandler := siteconfig.NewHandlerWithStore(siteConfigSvc, uploadStore, auditSvc)
	storageHealth, _ := uploadStore.(systemstatus.HealthChecker)
	systemStatusSvc := systemstatus.NewService(cfg, db.Pool, redisClient.Raw(), storageHealth)
	systemStatusHandler := systemstatus.NewHandler(systemStatusSvc)

	emailSender := buildEmailSender(cfg, log)
	telegramRepo := telegram.NewRepository(db.Pool)
	telegramClient := telegram.NewClient(cfg.TelegramBotToken, cfg.TelegramAPIBaseURL)
	telegramSvc := telegram.NewService(telegramRepo, telegramClient, cfg.TelegramBotUsername, cfg.TelegramBotToken != "")
	telegramHandler := telegram.NewHandler(telegramSvc, cfg.TelegramWebhookSecret)
	telegramHandler.SetDeliveryLister(notifRepo)
	automationHandler := notifications.NewAdminHandler(notifRepo, cfg.TelegramBotToken != "", auditSvc)
	notifWorker := notifications.NewWorker(notifRepo, notifQueue, regRepo, eventsRepo, emailSender, log,
		cfg.NotificationSweepInterval, cfg.NotificationMaxAttempts, cfg.PublicAppURL)
	telegramWorker := notifications.NewTelegramWorker(notifRepo, regRepo, eventsRepo, telegramSvc, log,
		telegramDeliveryPoll, cfg.NotificationMaxAttempts, cfg.PublicAppURL)
	reminderScheduler := notifications.NewReminderScheduler(notifSvc, eventsRepo, regRepo, log,
		cfg.ReminderPollInterval, cfg.ReminderWindow)
	eventAutomationRepo := eventautomations.NewRepository(db.Pool)
	eventAutomationSvc := eventautomations.NewService(eventAutomationRepo)
	eventAutomationHandler := eventautomations.NewHandler(eventAutomationSvc, auditSvc)
	eventAutomationScheduler := eventautomations.NewScheduler(eventAutomationRepo, regRepo, eventNotifier, log,
		15*time.Second, cfg.NotificationMaxAttempts)
	paymentReconciler := registrations.NewPaymentReconciler(regSvc, log, 15*time.Second)

	backgroundCtx, stopBackground := context.WithCancel(context.Background())
	defer stopBackground()
	var backgroundWG sync.WaitGroup

	// Metrics gauges are sampled from every process (api replicas and the
	// worker), since each has its own pgx pool and Redis view.
	backgroundWG.Add(1)
	go func() {
		defer backgroundWG.Done()
		runMetricsGaugeUpdater(backgroundCtx, db, redisClient.Raw(), 10*time.Second)
	}()

	if cfg.ProcessRole != "api" {
		for _, runWorker := range []func(context.Context){
			notifWorker.Run,
			telegramWorker.Run,
			reminderScheduler.Run,
			eventAutomationScheduler.Run,
			paymentReconciler.Run,
			func(ctx context.Context) { runLiveActivityExpiry(ctx, liveActivitiesRepo, log, time.Minute) },
			func(ctx context.Context) { runIdempotencyCleanup(ctx, idemRepo, log, time.Hour) },
		} {
			backgroundWG.Add(1)
			go func(run func(context.Context)) {
				defer backgroundWG.Done()
				run(backgroundCtx)
			}(runWorker)
		}
		log.Info("background_jobs_started")
	}

	router := apphttp.NewRouter(apphttp.Deps{
		Logger:                       log,
		DB:                           db,
		Redis:                        redisClient,
		CORSAllowedOrigins:           cfg.CORSAllowedOrigins,
		UploadDir:                    cfg.UploadDir,
		Tokens:                       tokens,
		AuthHandler:                  authHandler,
		EventsHandler:                eventsHandler,
		RegistrationsHandler:         regHandler,
		LiveActivitiesHandler:        liveActivitiesHandler,
		CheckinHandler:               checkinHandler,
		AdminHandler:                 adminHandler,
		StatsHandler:                 statsHandler,
		SiteConfigHandler:            siteConfigHandler,
		SystemStatusHandler:          systemStatusHandler,
		MediaHandler:                 mediaHandler,
		TelegramHandler:              telegramHandler,
		AutomationHandler:            automationHandler,
		EventAutomationsHandler:      eventAutomationHandler,
		RateLimiter:                  sharedRateLimiter,
		EventsReadRateLimitMax:       cfg.RateLimitEventsReadMax,
		EventsReadRateLimitWindow:    cfg.RateLimitEventsReadWindow,
		PaymentVerifyRateLimitMax:    cfg.RateLimitPaymentVerifyMax,
		PaymentVerifyRateLimitWindow: cfg.RateLimitPaymentVerifyWindow,
	})

	if cfg.ProcessRole == "worker" {
		router = apphttp.NewHealthRouter(apphttp.Deps{DB: db, Redis: redisClient})
	}
	srv := apphttp.NewServer(":"+cfg.Port, router)

	// Metrics are served on a separate, Docker-network-only port (never
	// published through Traefik's public entrypoint) — see docker-compose's
	// api/worker `expose` (not `ports`) for METRICS_PORT, mirroring how
	// Traefik's own control-plane health entrypoint is internal-only.
	metricsMux := http.NewServeMux()
	metricsMux.Handle("/metrics", promhttp.Handler())
	metricsSrv := &http.Server{Addr: ":" + cfg.MetricsPort, Handler: metricsMux}
	go func() {
		if err := metricsSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("metrics_server_failed", "error", err)
		}
	}()

	serverErrCh := make(chan error, 1)
	go func() {
		log.Info("server_starting", "port", cfg.Port, "app_env", cfg.AppEnv, "process_role", cfg.ProcessRole)
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
		_ = metricsSrv.Shutdown(shutdownCtx)

		// Stop background workers and wait (bounded) for their current unit of
		// work to finish before the deferred db/redis closes run — otherwise a
		// worker can still be mid-query when the connections underneath it close.
		stopBackground()
		waitCtx, waitCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer waitCancel()
		done := make(chan struct{})
		go func() {
			backgroundWG.Wait()
			close(done)
		}()
		select {
		case <-done:
			log.Info("background_jobs_stopped")
		case <-waitCtx.Done():
			log.Warn("background_jobs_stop_timeout")
		}

		log.Info("shutdown_complete")
	}

	return nil
}

func runLiveActivityExpiry(ctx context.Context, repo *liveactivities.Repository, log *slog.Logger, interval time.Duration) {
	sweep := func() {
		n, err := repo.ExpireStale(ctx)
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				log.Warn("live_activity_expiry_failed", "error", err)
			}
		} else if n > 0 {
			log.Info("live_activity_expiry", "expired", n)
		}
	}
	sweep()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sweep()
		}
	}
}

// runMetricsGaugeUpdater periodically samples the pgx pool and the Redis
// notification queue length into their Prometheus gauges. Runs until ctx is
// cancelled.
func runMetricsGaugeUpdater(ctx context.Context, db *database.DB, rdb *redis.Client, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if db != nil && db.Pool != nil {
				stat := db.Pool.Stat()
				metrics.DBPoolAcquiredConns.Set(float64(stat.AcquiredConns()))
				metrics.DBPoolIdleConns.Set(float64(stat.IdleConns()))
			}
			if rdb != nil {
				if depth, err := rdb.LLen(ctx, "notifications:queue").Result(); err == nil {
					metrics.NotificationQueueDepth.Set(float64(depth))
				}
			}
		}
	}
}

// runIdempotencyCleanup periodically deletes expired idempotency records so
// the table doesn't grow unbounded. Runs until ctx is cancelled.
func runIdempotencyCleanup(ctx context.Context, repo *idempotency.Repository, log *slog.Logger, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			n, err := repo.DeleteExpired(ctx, time.Now())
			if err != nil {
				log.Warn("idempotency_cleanup_failed", "error", err)
			} else if n > 0 {
				log.Info("idempotency_cleanup", "deleted", n)
			}
		}
	}
}

func buildPaymentProvider(cfg *config.Config) (payments.Provider, error) {
	if cfg.PaymentProvider == "mock" {
		return payments.NewMockProvider(), nil
	}
	return payments.NewBakongProvider(payments.BakongConfig{
		BaseURL: cfg.BakongBaseURL, Token: cfg.BakongToken, PaymentTTL: cfg.BakongPaymentTTL,
		Merchant: payments.KHQRMerchant{
			AccountID: cfg.BakongAccountID, MerchantID: cfg.BakongMerchantID,
			AcquiringBank: cfg.BakongAcquiringBank, MerchantName: cfg.BakongMerchantName,
			MerchantCity: cfg.BakongMerchantCity, MCC: cfg.BakongMCC,
			StoreLabel: cfg.BakongStoreLabel, TerminalLabel: cfg.BakongTerminalLabel,
		},
	})
}

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
