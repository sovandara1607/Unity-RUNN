// Package systemstatus builds a sanitized operational snapshot for the Super
// Admin console. It never returns credentials, tokens, passwords, DSNs, or
// secret-bearing URLs.
package systemstatus

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/unity-run-club/api/internal/config"
)

const probeTimeout = 2 * time.Second

type HealthChecker interface {
	Ping(ctx context.Context) error
}

type Service struct {
	cfg       *config.Config
	db        *pgxpool.Pool
	redis     *redis.Client
	storage   HealthChecker
	client    *http.Client
	startedAt time.Time
}

func NewService(cfg *config.Config, db *pgxpool.Pool, redisClient *redis.Client, storage HealthChecker) *Service {
	return &Service{
		cfg: cfg, db: db, redis: redisClient, storage: storage,
		client: &http.Client{Timeout: probeTimeout}, startedAt: time.Now(),
	}
}

type Snapshot struct {
	GeneratedAt  time.Time     `json:"generated_at"`
	Overall      string        `json:"overall"`
	Summary      Summary       `json:"summary"`
	Application  Application   `json:"application"`
	Services     []ServiceItem `json:"services"`
	DataStores   DataStores    `json:"data_stores"`
	Integrations Integrations  `json:"integrations"`
	Security     Security      `json:"security"`
	Workers      Workers       `json:"workers"`
	Resilience   Resilience    `json:"resilience"`
}

type Summary struct {
	Operational int `json:"operational"`
	Attention   int `json:"attention"`
	Unavailable int `json:"unavailable"`
}

type Application struct {
	Environment    string   `json:"environment"`
	LogLevel       string   `json:"log_level"`
	PublicAppURL   string   `json:"public_app_url"`
	UptimeSeconds  int64    `json:"uptime_seconds"`
	GoVersion      string   `json:"go_version"`
	Version        string   `json:"version"`
	Commit         string   `json:"commit"`
	BuildTime      string   `json:"build_time"`
	ModifiedBuild  bool     `json:"modified_build"`
	AllowedOrigins []string `json:"allowed_origins"`
}

type ServiceItem struct {
	Name      string `json:"name"`
	Role      string `json:"role"`
	Status    string `json:"status"`
	Detail    string `json:"detail"`
	LatencyMS int64  `json:"latency_ms,omitempty"`
}

type DataStores struct {
	Postgres PostgresStatus `json:"postgres"`
	Redis    RedisStatus    `json:"redis"`
	Storage  StorageStatus  `json:"storage"`
}

type PostgresStatus struct {
	Status            string `json:"status"`
	Detail            string `json:"detail"`
	LatencyMS         int64  `json:"latency_ms"`
	Endpoint          string `json:"endpoint"`
	Database          string `json:"database"`
	SizeBytes         int64  `json:"size_bytes"`
	TableCount        int64  `json:"table_count"`
	Migration         int64  `json:"migration"`
	MaxConnections    int32  `json:"max_connections"`
	TotalConnections  int32  `json:"total_connections"`
	ActiveConnections int32  `json:"active_connections"`
	IdleConnections   int32  `json:"idle_connections"`
}

type RedisStatus struct {
	Status           string `json:"status"`
	Detail           string `json:"detail"`
	LatencyMS        int64  `json:"latency_ms"`
	Endpoint         string `json:"endpoint"`
	Database         int    `json:"database"`
	UsedMemoryBytes  int64  `json:"used_memory_bytes"`
	QueueDepth       int64  `json:"queue_depth"`
	TotalConnections uint32 `json:"total_connections"`
	IdleConnections  uint32 `json:"idle_connections"`
}

type StorageStatus struct {
	Status    string `json:"status"`
	Detail    string `json:"detail"`
	LatencyMS int64  `json:"latency_ms"`
	Provider  string `json:"provider"`
	Endpoint  string `json:"endpoint"`
	Bucket    string `json:"bucket"`
	Delivery  string `json:"delivery"`
}

type Integrations struct {
	Realtime IntegrationStatus `json:"realtime"`
	Email    IntegrationStatus `json:"email"`
	OAuth    IntegrationStatus `json:"oauth"`
	Payments IntegrationStatus `json:"payments"`
}

type IntegrationStatus struct {
	Status    string `json:"status"`
	Provider  string `json:"provider"`
	Detail    string `json:"detail"`
	Endpoint  string `json:"endpoint"`
	Identity  string `json:"identity,omitempty"`
	LatencyMS int64  `json:"latency_ms,omitempty"`
}

type Security struct {
	JWTSecretConfigured     bool     `json:"jwt_secret_configured"`
	AccessTokenTTL          string   `json:"access_token_ttl"`
	RefreshTokenTTL         string   `json:"refresh_token_ttl"`
	BcryptCost              int      `json:"bcrypt_cost"`
	SecureCookies           bool     `json:"secure_cookies"`
	AllowedOrigins          []string `json:"allowed_origins"`
	OAuthSecretConfigured   bool     `json:"oauth_secret_configured"`
	StorageSecretConfigured bool     `json:"storage_secret_configured"`
	SMTPSecretConfigured    bool     `json:"smtp_secret_configured"`
	PaymentSecretConfigured bool     `json:"payment_secret_configured"`
}

type Workers struct {
	NotificationQueueDepth  int64  `json:"notification_queue_depth"`
	NotificationsPending    int64  `json:"notifications_pending"`
	NotificationsFailed     int64  `json:"notifications_failed"`
	NotificationSweep       string `json:"notification_sweep"`
	NotificationMaxAttempts int    `json:"notification_max_attempts"`
	ReminderPoll            string `json:"reminder_poll"`
	ReminderWindow          string `json:"reminder_window"`
}

type Resilience struct {
	DatabaseRole string `json:"database_role"`
	RedisRole    string `json:"redis_role"`
	MediaRole    string `json:"media_role"`
	BackupStatus string `json:"backup_status"`
	BackupDetail string `json:"backup_detail"`
	Migration    int64  `json:"migration"`
}

func (s *Service) Snapshot(ctx context.Context) Snapshot {
	postgres := PostgresStatus{Status: "unavailable", Detail: "PostgreSQL is not reachable"}
	redisStatus := RedisStatus{Status: "unavailable", Detail: "Redis is not reachable", Database: s.cfg.RedisDB}
	storage := StorageStatus{Provider: s.cfg.ObjectStorageProvider, Status: "unavailable", Detail: "Storage is not reachable"}
	realtime := IntegrationStatus{Provider: "Socket.IO", Status: "unavailable", Detail: "Realtime gateway is not reachable"}

	var wg sync.WaitGroup
	wg.Add(4)
	go func() { defer wg.Done(); postgres = s.postgresStatus(ctx) }()
	go func() { defer wg.Done(); redisStatus = s.redisStatus(ctx) }()
	go func() { defer wg.Done(); storage = s.storageStatus(ctx) }()
	go func() { defer wg.Done(); realtime = s.realtimeStatus(ctx) }()
	wg.Wait()

	app := buildApplication(s.cfg, s.startedAt)
	emailStatus := buildEmailStatus(s.cfg)
	oauthStatus := buildOAuthStatus(s.cfg)
	paymentStatus := buildPaymentStatus(s.cfg)
	services := []ServiceItem{
		{Name: "API", Role: "Application", Status: "operational", Detail: "Go API is serving this diagnostic snapshot"},
		{Name: "PostgreSQL", Role: "Source of truth", Status: postgres.Status, Detail: postgres.Detail, LatencyMS: postgres.LatencyMS},
		{Name: "Redis", Role: "Queue, cache and locks", Status: redisStatus.Status, Detail: redisStatus.Detail, LatencyMS: redisStatus.LatencyMS},
		{Name: strings.ToUpper(s.cfg.ObjectStorageProvider), Role: "Media storage", Status: storage.Status, Detail: storage.Detail, LatencyMS: storage.LatencyMS},
		{Name: "Socket.IO", Role: "Live public updates", Status: realtime.Status, Detail: realtime.Detail, LatencyMS: realtime.LatencyMS},
		{Name: "Email", Role: "Runner messages", Status: emailStatus.Status, Detail: emailStatus.Detail},
		{Name: "Payments", Role: "Ticket settlement", Status: paymentStatus.Status, Detail: paymentStatus.Detail},
	}
	summary := summarize(services)
	overall := "operational"
	if summary.Unavailable > 0 {
		overall = "degraded"
	}

	return Snapshot{
		GeneratedAt: time.Now().UTC(), Overall: overall, Summary: summary, Application: app, Services: services,
		DataStores:   DataStores{Postgres: postgres, Redis: redisStatus, Storage: storage},
		Integrations: Integrations{Realtime: realtime, Email: emailStatus, OAuth: oauthStatus, Payments: paymentStatus},
		Security: Security{
			JWTSecretConfigured: s.cfg.JWTSecret != "", AccessTokenTTL: s.cfg.AccessTokenTTL.String(),
			RefreshTokenTTL: s.cfg.RefreshTokenTTL.String(), BcryptCost: s.cfg.BcryptCost,
			SecureCookies: s.cfg.AppEnv != "development", AllowedOrigins: append([]string(nil), s.cfg.CORSAllowedOrigins...),
			OAuthSecretConfigured: s.cfg.GoogleOAuthClientSecret != "", StorageSecretConfigured: s.cfg.R2SecretAccessKey != "",
			SMTPSecretConfigured: s.cfg.SMTPPassword != "", PaymentSecretConfigured: s.cfg.BakongToken != "",
		},
		Workers: Workers{
			NotificationQueueDepth: redisStatus.QueueDepth, NotificationsPending: postgresPending(postgres, s.db, ctx, "PENDING"),
			NotificationsFailed: postgresPending(postgres, s.db, ctx, "FAILED"), NotificationSweep: s.cfg.NotificationSweepInterval.String(),
			NotificationMaxAttempts: s.cfg.NotificationMaxAttempts, ReminderPoll: s.cfg.ReminderPollInterval.String(), ReminderWindow: s.cfg.ReminderWindow.String(),
		},
		Resilience: Resilience{
			DatabaseRole: "Authoritative business data", RedisRole: "Ephemeral queue, cache, locks and realtime transport",
			MediaRole: mediaRole(s.cfg), BackupStatus: "not_configured", BackupDetail: "No automated database or media backup policy is configured in this repository.", Migration: postgres.Migration,
		},
	}
}

func (s *Service) postgresStatus(ctx context.Context) PostgresStatus {
	host, databaseName := safeDatabaseEndpoint(s.cfg.DatabaseURL)
	status := PostgresStatus{Status: "unavailable", Detail: "PostgreSQL is not reachable", Endpoint: host, Database: databaseName}
	if s.db == nil {
		return status
	}
	probeCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	started := time.Now()
	if err := s.db.Ping(probeCtx); err != nil {
		return status
	}
	status.LatencyMS = elapsedMS(started)
	pool := s.db.Stat()
	status.MaxConnections, status.TotalConnections = pool.MaxConns(), pool.TotalConns()
	status.ActiveConnections, status.IdleConnections = pool.AcquiredConns(), pool.IdleConns()
	const query = `SELECT pg_database_size(current_database()), (SELECT count(*) FROM pg_stat_user_tables), COALESCE((SELECT max(version_id) FROM goose_db_version WHERE is_applied), 0)`
	if err := s.db.QueryRow(probeCtx, query).Scan(&status.SizeBytes, &status.TableCount, &status.Migration); err != nil {
		status.Status, status.Detail = "attention", "Connected, but operational metrics could not be loaded"
		return status
	}
	status.Status, status.Detail = "operational", "Primary database is accepting queries"
	return status
}

func (s *Service) redisStatus(ctx context.Context) RedisStatus {
	status := RedisStatus{Status: "unavailable", Detail: "Redis is not reachable", Endpoint: safeHostPort(s.cfg.RedisAddr), Database: s.cfg.RedisDB}
	if s.redis == nil {
		return status
	}
	probeCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	started := time.Now()
	if err := s.redis.Ping(probeCtx).Err(); err != nil {
		return status
	}
	status.LatencyMS = elapsedMS(started)
	status.QueueDepth, _ = s.redis.LLen(probeCtx, "notifications:queue").Result()
	if info, err := s.redis.Info(probeCtx, "memory").Result(); err == nil {
		status.UsedMemoryBytes = infoInt(info, "used_memory")
	}
	pool := s.redis.PoolStats()
	status.TotalConnections, status.IdleConnections = pool.TotalConns, pool.IdleConns
	status.Status, status.Detail = "operational", "Cache, locks and queues are available"
	return status
}

func (s *Service) storageStatus(ctx context.Context) StorageStatus {
	status := StorageStatus{Provider: s.cfg.ObjectStorageProvider, Bucket: s.cfg.R2Bucket, Delivery: s.cfg.R2PublicBaseURL}
	if s.cfg.ObjectStorageProvider == "r2" {
		status.Endpoint = safeURLHost(s.cfg.R2Endpoint)
	} else {
		status.Endpoint, status.Delivery = "local filesystem", "/uploads"
	}
	if s.storage == nil {
		status.Status, status.Detail = "unavailable", "Storage health check is not configured"
		return status
	}
	probeCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	started := time.Now()
	if err := s.storage.Ping(probeCtx); err != nil {
		status.Status, status.Detail = "unavailable", "Configured storage is not reachable"
		return status
	}
	status.LatencyMS, status.Status = elapsedMS(started), "operational"
	if s.cfg.ObjectStorageProvider == "r2" {
		status.Detail = "Cloudflare R2 bucket is reachable"
	} else {
		status.Detail = "Local upload directory is available"
	}
	return status
}

func (s *Service) realtimeStatus(ctx context.Context) IntegrationStatus {
	status := IntegrationStatus{Provider: "Socket.IO", Status: "unavailable", Detail: "Realtime gateway is not reachable", Endpoint: safeURLHost(s.cfg.RealtimeInternalURL)}
	probeCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(probeCtx, http.MethodGet, s.cfg.RealtimeInternalURL+"/health", nil)
	if err != nil {
		return status
	}
	started := time.Now()
	response, err := s.client.Do(request)
	if err != nil {
		return status
	}
	defer response.Body.Close()
	status.LatencyMS = elapsedMS(started)
	if response.StatusCode != http.StatusOK {
		status.Detail = "Realtime gateway returned an unhealthy response"
		return status
	}
	status.Status, status.Detail = "operational", "Public pages receive live configuration updates"
	return status
}

func buildEmailStatus(cfg *config.Config) IntegrationStatus {
	if cfg.SMTPHost == "" {
		return IntegrationStatus{Status: "disabled", Provider: "Log only", Detail: "SMTP is not configured; emails are written to application logs"}
	}
	return IntegrationStatus{Status: "configured", Provider: "SMTP", Detail: "Transactional email is configured with mandatory TLS", Endpoint: fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort), Identity: maskEmail(cfg.SMTPFrom)}
}

func buildOAuthStatus(cfg *config.Config) IntegrationStatus {
	if cfg.GoogleOAuthClientID == "" {
		return IntegrationStatus{Status: "disabled", Provider: "Google", Detail: "Google sign-in is not configured"}
	}
	return IntegrationStatus{Status: "configured", Provider: "Google", Detail: "Google sign-in is available", Endpoint: cfg.GoogleOAuthRedirectURL, Identity: maskIdentifier(cfg.GoogleOAuthClientID)}
}

func buildPaymentStatus(cfg *config.Config) IntegrationStatus {
	if cfg.PaymentProvider == "mock" {
		return IntegrationStatus{Status: "attention", Provider: "Mock", Detail: "Development payment simulator is active; no real funds are settled"}
	}
	configured := cfg.BakongToken != "" && cfg.BakongAccountID != "" && cfg.BakongMerchantID != ""
	status, detail := "configured", "Bakong KHQR is configured for payment verification"
	if !configured {
		status, detail = "unavailable", "Bakong is selected but required credentials are missing"
	}
	return IntegrationStatus{Status: status, Provider: "Bakong KHQR", Detail: detail, Endpoint: safeURLHost(cfg.BakongBaseURL), Identity: maskIdentifier(cfg.BakongMerchantID)}
}

func buildApplication(cfg *config.Config, startedAt time.Time) Application {
	version, commit, buildTime, modified := "development", "not embedded", "not embedded", false
	if info, ok := debug.ReadBuildInfo(); ok {
		if info.Main.Version != "" && info.Main.Version != "(devel)" {
			version = info.Main.Version
		}
		for _, setting := range info.Settings {
			switch setting.Key {
			case "vcs.revision":
				commit = shorten(setting.Value)
			case "vcs.time":
				buildTime = setting.Value
			case "vcs.modified":
				modified = setting.Value == "true"
			}
		}
	}
	return Application{Environment: cfg.AppEnv, LogLevel: cfg.LogLevel, PublicAppURL: cfg.PublicAppURL, UptimeSeconds: int64(time.Since(startedAt).Seconds()), GoVersion: runtime.Version(), Version: version, Commit: commit, BuildTime: buildTime, ModifiedBuild: modified, AllowedOrigins: append([]string(nil), cfg.CORSAllowedOrigins...)}
}

func summarize(items []ServiceItem) Summary {
	var out Summary
	for _, item := range items {
		switch item.Status {
		case "operational", "configured":
			out.Operational++
		case "unavailable":
			out.Unavailable++
		default:
			out.Attention++
		}
	}
	return out
}
func postgresPending(status PostgresStatus, db *pgxpool.Pool, ctx context.Context, notificationStatus string) int64 {
	if db == nil || status.Status == "unavailable" {
		return 0
	}
	probeCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	var count int64
	_ = db.QueryRow(probeCtx, `SELECT count(*) FROM notifications WHERE status=$1`, notificationStatus).Scan(&count)
	return count
}
func mediaRole(cfg *config.Config) string {
	if cfg.ObjectStorageProvider == "r2" {
		return "Cloudflare R2 stores uploaded posters and public-site media"
	}
	return "Local persistent volume stores uploaded media"
}
func elapsedMS(started time.Time) int64 {
	value := time.Since(started).Milliseconds()
	if value < 1 {
		return 1
	}
	return value
}
func infoInt(info, key string) int64 {
	for _, line := range strings.Split(info, "\n") {
		if strings.HasPrefix(line, key+":") {
			value, _ := strconv.ParseInt(strings.TrimSpace(strings.TrimPrefix(line, key+":")), 10, 64)
			return value
		}
	}
	return 0
}
func safeHostPort(raw string) string {
	host := strings.TrimSpace(strings.Split(raw, "@")[len(strings.Split(raw, "@"))-1])
	return host
}
func safeURLHost(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" {
		return "not configured"
	}
	return parsed.Host
}
func safeDatabaseEndpoint(raw string) (string, string) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "configured", "configured"
	}
	return parsed.Host, strings.TrimPrefix(parsed.Path, "/")
}
func maskIdentifier(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if len(value) <= 10 {
		return "configured"
	}
	return value[:4] + "…" + value[len(value)-4:]
}
func maskEmail(value string) string {
	parts := strings.Split(value, "@")
	if len(parts) != 2 || parts[0] == "" {
		return "configured"
	}
	return parts[0][:1] + "***@" + parts[1]
}
func shorten(value string) string {
	if len(value) > 12 {
		return value[:12]
	}
	return value
}
