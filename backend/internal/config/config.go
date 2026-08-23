// Package config loads and validates application configuration from
// environment variables. It intentionally avoids third-party config
// frameworks — the surface area here is small enough that a typed
// struct plus explicit parsing stays easy to read and test.
package config

import (
	"fmt"
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

	RedisAddr     string
	RedisPassword string
	RedisDB       int

	CORSAllowedOrigins []string

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

	ReminderWindow            time.Duration
	ReminderPollInterval      time.Duration
	NotificationSweepInterval time.Duration
	NotificationMaxAttempts   int

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
		ShutdownTimeout:           10 * time.Second,
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

	if v := os.Getenv("REDIS_DB"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("config: invalid REDIS_DB %q: %w", v, err)
		}
		cfg.RedisDB = n
	}

	origins := getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
	cfg.CORSAllowedOrigins = splitAndTrim(origins)

	cfg.SMTPHost = os.Getenv("SMTP_HOST")
	cfg.SMTPUser = os.Getenv("SMTP_USER")
	cfg.SMTPPassword = os.Getenv("SMTP_PASSWORD")
	cfg.SMTPFrom = os.Getenv("SMTP_FROM")

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

	return cfg, nil
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
