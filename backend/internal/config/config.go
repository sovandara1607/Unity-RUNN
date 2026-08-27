// Package config loads and validates application configuration from
// environment variables. It intentionally avoids third-party config
// frameworks — the surface area here is small enough that a typed
// struct plus explicit parsing stays easy to read and test.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all runtime configuration for the API process.
type Config struct {
	AppEnv   string // "development", "staging", "production"
	Port     string
	LogLevel string // "debug", "info", "warn", "error"

	DatabaseURL     string
	DatabaseMaxConn int32

	RedisAddr           string
	RedisPassword       string
	RedisDB             int
	RealtimeInternalURL string

	CORSAllowedOrigins    []string
	UploadDir             string
	ObjectStorageProvider string
	R2Endpoint            string
	R2AccessKeyID         string
	R2SecretAccessKey     string
	R2Bucket              string
	R2PublicBaseURL       string

	JWTSecret       string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	BcryptCost      int

	// SMTP is optional: empty SMTPHost means emails are logged, not
	// sent (see internal/email.NoopSender) — for local development
	// without real Gmail credentials. Required in production.
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string

	PublicAppURL            string
	GoogleOAuthClientID     string
	GoogleOAuthClientSecret string
	GoogleOAuthRedirectURL  string

	ReminderWindow            time.Duration
	ReminderPollInterval      time.Duration
	NotificationSweepInterval time.Duration
	NotificationMaxAttempts   int

	PaymentProvider     string
	BakongBaseURL       string
	BakongToken         string
	BakongAccountID     string
	BakongMerchantID    string
	BakongAcquiringBank string
	BakongMerchantName  string
	BakongMerchantCity  string
	BakongMCC           string
	BakongStoreLabel    string
	BakongTerminalLabel string
	BakongPaymentTTL    time.Duration

	ShutdownTimeout time.Duration
}

// Load reads configuration from environment variables, applying
// defaults where sensible and returning an error if a required
// variable is missing or malformed.
func Load() (*Config, error) {
	cfg := &Config{
		AppEnv:                    getEnv("APP_ENV", "development"),
		Port:                      getEnv("PORT", "8080"),
		LogLevel:                  getEnv("LOG_LEVEL", "info"),
		DatabaseMaxConn:           10,
		RedisDB:                   0,
		AccessTokenTTL:            15 * time.Minute,
		RefreshTokenTTL:           30 * 24 * time.Hour,
		BcryptCost:                12,
		SMTPPort:                  587,
		ReminderWindow:            24 * time.Hour,
		ReminderPollInterval:      15 * time.Minute,
		NotificationSweepInterval: 30 * time.Second,
		NotificationMaxAttempts:   5,
		PaymentProvider:           "mock",
		BakongMerchantCity:        "PHNOM PENH",
		BakongMCC:                 "5999",
		BakongStoreLabel:          "UNITY RUNN CLUB",
		BakongTerminalLabel:       "WEB",
		BakongPaymentTTL:          10 * time.Minute,
		ShutdownTimeout:           10 * time.Second,
		UploadDir:                 "uploads",
		ObjectStorageProvider:     "local",
	}

	dbURL, err := requireEnv("DATABASE_URL")
	if err != nil {
		return nil, err
	}
	cfg.DatabaseURL = dbURL

	jwtSecret, err := requireEnv("JWT_SECRET")
	if err != nil {
		return nil, err
	}
	cfg.JWTSecret = jwtSecret

	if v := os.Getenv("ACCESS_TOKEN_TTL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid ACCESS_TOKEN_TTL %q: %w", v, err)
		}
		cfg.AccessTokenTTL = d
	}

	if v := os.Getenv("REFRESH_TOKEN_TTL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid REFRESH_TOKEN_TTL %q: %w", v, err)
		}
		cfg.RefreshTokenTTL = d
	}

	if v := os.Getenv("BCRYPT_COST"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid BCRYPT_COST %q: %w", v, err)
		}
		cfg.BcryptCost = n
	}

	if v := os.Getenv("DATABASE_MAX_CONN"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid DATABASE_MAX_CONN %q: %w", v, err)
		}
		cfg.DatabaseMaxConn = int32(n)
	}

	cfg.RedisAddr = getEnv("REDIS_ADDR", "localhost:6379")
	cfg.RedisPassword = os.Getenv("REDIS_PASSWORD")
	cfg.RealtimeInternalURL = strings.TrimRight(strings.TrimSpace(getEnv("REALTIME_INTERNAL_URL", "http://localhost:8081")), "/")

	if v := os.Getenv("REDIS_DB"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid REDIS_DB %q: %w", v, err)
		}
		cfg.RedisDB = n
	}

	origins := getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
	cfg.CORSAllowedOrigins = splitAndTrim(origins)
	publicAppDefault := "http://localhost:3000"
	if len(cfg.CORSAllowedOrigins) > 0 {
		publicAppDefault = cfg.CORSAllowedOrigins[0]
	}
	cfg.PublicAppURL = strings.TrimRight(strings.TrimSpace(getEnv("PUBLIC_APP_URL", publicAppDefault)), "/")
	cfg.UploadDir = getEnv("UPLOAD_DIR", cfg.UploadDir)
	cfg.ObjectStorageProvider = strings.ToLower(getEnv("OBJECT_STORAGE_PROVIDER", cfg.ObjectStorageProvider))
	cfg.R2Endpoint = strings.TrimSpace(os.Getenv("R2_ENDPOINT"))
	cfg.R2AccessKeyID = strings.TrimSpace(os.Getenv("R2_ACCESS_KEY_ID"))
	cfg.R2SecretAccessKey = strings.TrimSpace(os.Getenv("R2_SECRET_ACCESS_KEY"))
	cfg.R2Bucket = strings.TrimSpace(os.Getenv("R2_BUCKET"))
	cfg.R2PublicBaseURL = strings.TrimRight(strings.TrimSpace(os.Getenv("R2_PUBLIC_BASE_URL")), "/")
	if cfg.ObjectStorageProvider == "r2" && cfg.R2PublicBaseURL == "" {
		cfg.R2PublicBaseURL = "/api/v1/media"
	}

	cfg.SMTPHost = strings.TrimSpace(os.Getenv("SMTP_HOST"))
	cfg.SMTPUser = strings.TrimSpace(os.Getenv("SMTP_USER"))
	cfg.SMTPPassword = os.Getenv("SMTP_PASSWORD")
	cfg.SMTPFrom = strings.TrimSpace(os.Getenv("SMTP_FROM"))
	cfg.GoogleOAuthClientID = strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_ID"))
	cfg.GoogleOAuthClientSecret = strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"))
	cfg.GoogleOAuthRedirectURL = strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_REDIRECT_URL"))
	cfg.PaymentProvider = strings.ToLower(getEnv("PAYMENT_PROVIDER", cfg.PaymentProvider))
	cfg.BakongBaseURL = os.Getenv("BAKONG_BASE_URL")
	cfg.BakongToken = os.Getenv("BAKONG_TOKEN")
	cfg.BakongAccountID = os.Getenv("BAKONG_ACCOUNT_ID")
	cfg.BakongMerchantID = os.Getenv("BAKONG_MERCHANT_ID")
	cfg.BakongAcquiringBank = os.Getenv("BAKONG_ACQUIRING_BANK")
	cfg.BakongMerchantName = os.Getenv("BAKONG_MERCHANT_NAME")
	cfg.BakongMerchantCity = getEnv("BAKONG_MERCHANT_CITY", cfg.BakongMerchantCity)
	cfg.BakongMCC = getEnv("BAKONG_MCC", cfg.BakongMCC)
	cfg.BakongStoreLabel = getEnv("BAKONG_STORE_LABEL", cfg.BakongStoreLabel)
	cfg.BakongTerminalLabel = getEnv("BAKONG_TERMINAL_LABEL", cfg.BakongTerminalLabel)
	if v := os.Getenv("BAKONG_PAYMENT_TTL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid BAKONG_PAYMENT_TTL %q: %w", v, err)
		}
		cfg.BakongPaymentTTL = d
	}
	if cfg.PaymentProvider != "mock" && cfg.PaymentProvider != "bakong" {
		return nil, fmt.Errorf("config: PAYMENT_PROVIDER must be mock or bakong")
	}

	if v := os.Getenv("SMTP_PORT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid SMTP_PORT %q: %w", v, err)
		}
		cfg.SMTPPort = n
	}

	if v := os.Getenv("REMINDER_WINDOW"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid REMINDER_WINDOW %q: %w", v, err)
		}
		cfg.ReminderWindow = d
	}

	if v := os.Getenv("REMINDER_POLL_INTERVAL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid REMINDER_POLL_INTERVAL %q: %w", v, err)
		}
		cfg.ReminderPollInterval = d
	}

	if v := os.Getenv("NOTIFICATION_SWEEP_INTERVAL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid NOTIFICATION_SWEEP_INTERVAL %q: %w", v, err)
		}
		cfg.NotificationSweepInterval = d
	}

	if v := os.Getenv("NOTIFICATION_MAX_ATTEMPTS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid NOTIFICATION_MAX_ATTEMPTS %q: %w", v, err)
		}
		cfg.NotificationMaxAttempts = n
	}

	if err := validateRuntimeSecurity(cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

func validateRuntimeSecurity(cfg *Config) error {
	if cfg.AppEnv != "development" && cfg.AppEnv != "staging" && cfg.AppEnv != "production" {
		return fmt.Errorf("config: APP_ENV must be development, staging, or production")
	}
	if cfg.DatabaseMaxConn < 1 {
		return fmt.Errorf("config: DATABASE_MAX_CONN must be positive")
	}
	if cfg.AccessTokenTTL <= 0 || cfg.RefreshTokenTTL <= 0 {
		return fmt.Errorf("config: token TTLs must be positive")
	}
	if cfg.JWTSecret == "dev-jwt-secret-change-me" {
		return fmt.Errorf("config: JWT_SECRET must not use the development placeholder")
	}
	if cfg.AppEnv != "development" && len(cfg.JWTSecret) < 32 {
		return fmt.Errorf("config: staging and production JWT_SECRET must be at least 32 characters")
	}
	if cfg.BcryptCost < 4 || cfg.BcryptCost > 31 {
		return fmt.Errorf("config: BCRYPT_COST must be between 4 and 31")
	}
	if cfg.AppEnv != "development" && cfg.BcryptCost < 12 {
		return fmt.Errorf("config: staging and production BCRYPT_COST must be at least 12")
	}
	if len(cfg.CORSAllowedOrigins) == 0 {
		return fmt.Errorf("config: CORS_ALLOWED_ORIGINS must contain at least one origin")
	}
	realtimeURL, err := url.Parse(cfg.RealtimeInternalURL)
	if err != nil || (realtimeURL.Scheme != "http" && realtimeURL.Scheme != "https") || realtimeURL.Host == "" || realtimeURL.RawQuery != "" || realtimeURL.Fragment != "" {
		return fmt.Errorf("config: REALTIME_INTERNAL_URL must be a valid absolute URL without query or fragment")
	}
	if cfg.ObjectStorageProvider != "local" && cfg.ObjectStorageProvider != "r2" {
		return fmt.Errorf("config: OBJECT_STORAGE_PROVIDER must be local or r2")
	}
	if cfg.ObjectStorageProvider == "r2" {
		missing := make([]string, 0, 4)
		for key, value := range map[string]string{
			"R2_ENDPOINT":          cfg.R2Endpoint,
			"R2_ACCESS_KEY_ID":     cfg.R2AccessKeyID,
			"R2_SECRET_ACCESS_KEY": cfg.R2SecretAccessKey,
			"R2_BUCKET":            cfg.R2Bucket,
		} {
			if value == "" {
				missing = append(missing, key)
			}
		}
		if len(missing) > 0 {
			return fmt.Errorf("config: R2 storage requires %s", strings.Join(missing, ", "))
		}
		endpoint, err := url.Parse(cfg.R2Endpoint)
		if err != nil || endpoint.Scheme != "https" || endpoint.Host == "" {
			return fmt.Errorf("config: R2_ENDPOINT must be a valid https URL")
		}
		if !strings.HasPrefix(cfg.R2PublicBaseURL, "/") {
			publicURL, err := url.Parse(cfg.R2PublicBaseURL)
			if err != nil || publicURL.Scheme != "https" || publicURL.Host == "" {
				return fmt.Errorf("config: R2_PUBLIC_BASE_URL must be a root-relative path or valid https URL")
			}
		}
	}

	smtpConfigured := cfg.SMTPHost != "" || cfg.SMTPUser != "" || cfg.SMTPPassword != "" || cfg.SMTPFrom != ""
	if smtpConfigured {
		missing := make([]string, 0, 4)
		for key, value := range map[string]string{
			"SMTP_HOST": cfg.SMTPHost, "SMTP_USER": cfg.SMTPUser,
			"SMTP_PASSWORD": cfg.SMTPPassword, "SMTP_FROM": cfg.SMTPFrom,
		} {
			if value == "" {
				missing = append(missing, key)
			}
		}
		if len(missing) > 0 {
			return fmt.Errorf("config: SMTP requires %s", strings.Join(missing, ", "))
		}
		if cfg.SMTPPort < 1 || cfg.SMTPPort > 65535 {
			return fmt.Errorf("config: SMTP_PORT must be between 1 and 65535")
		}
	}

	googleConfigured := cfg.GoogleOAuthClientID != "" || cfg.GoogleOAuthClientSecret != "" || cfg.GoogleOAuthRedirectURL != ""
	if googleConfigured {
		if cfg.GoogleOAuthClientID == "" || cfg.GoogleOAuthClientSecret == "" || cfg.GoogleOAuthRedirectURL == "" {
			return fmt.Errorf("config: Google OAuth requires GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URL")
		}
		redirectURL, err := url.Parse(cfg.GoogleOAuthRedirectURL)
		if err != nil || (redirectURL.Scheme != "http" && redirectURL.Scheme != "https") || redirectURL.Host == "" || redirectURL.RawQuery != "" || redirectURL.Fragment != "" {
			return fmt.Errorf("config: GOOGLE_OAUTH_REDIRECT_URL must be a valid absolute URL without query or fragment")
		}
		if cfg.AppEnv == "production" && redirectURL.Scheme != "https" {
			return fmt.Errorf("config: production GOOGLE_OAUTH_REDIRECT_URL must use https")
		}
	}
	publicURL, err := url.Parse(cfg.PublicAppURL)
	if err != nil || (publicURL.Scheme != "http" && publicURL.Scheme != "https") || publicURL.Host == "" || publicURL.Path != "" || publicURL.RawQuery != "" || publicURL.Fragment != "" {
		return fmt.Errorf("config: PUBLIC_APP_URL must be a valid origin")
	}
	if cfg.AppEnv == "production" && publicURL.Scheme != "https" {
		return fmt.Errorf("config: production PUBLIC_APP_URL must use https")
	}

	for _, rawOrigin := range cfg.CORSAllowedOrigins {
		if rawOrigin == "*" {
			return fmt.Errorf("config: wildcard CORS origins are not allowed with credentials")
		}
		origin, err := url.Parse(rawOrigin)
		if err != nil || origin.Scheme == "" || origin.Host == "" || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
			return fmt.Errorf("config: invalid CORS origin %q", rawOrigin)
		}
		if cfg.AppEnv == "production" && origin.Scheme != "https" {
			return fmt.Errorf("config: production CORS origin %q must use https", rawOrigin)
		}
	}

	if cfg.AppEnv == "production" {
		if cfg.AccessTokenTTL > time.Hour {
			return fmt.Errorf("config: production ACCESS_TOKEN_TTL must not exceed 1h")
		}
		if cfg.RefreshTokenTTL > 30*24*time.Hour {
			return fmt.Errorf("config: production REFRESH_TOKEN_TTL must not exceed 30 days")
		}
		if cfg.PaymentProvider == "bakong" {
			baseURL, err := url.Parse(cfg.BakongBaseURL)
			if err != nil || baseURL.Scheme != "https" || baseURL.Host == "" {
				return fmt.Errorf("config: production BAKONG_BASE_URL must be a valid https URL")
			}
		}
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func requireEnv(key string) (string, error) {
	v := os.Getenv(key)
	if v == "" {
		return "", fmt.Errorf("config: required environment variable %s is not set", key)
	}
	return v, nil
}

func splitAndTrim(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
