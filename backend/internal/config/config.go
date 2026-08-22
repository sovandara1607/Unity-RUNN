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

	AdminAPIKey string

	ShutdownTimeout time.Duration
}

// Load reads configuration from environment variables, applying
// defaults where sensible and returning an error if a required
// variable is missing or malformed.
func Load() (*Config, error) {
	cfg := &Config{
		AppEnv:          getEnv("APP_ENV", "development"),
		Port:            getEnv("PORT", "8080"),
		LogLevel:        getEnv("LOG_LEVEL", "info"),
		DatabaseMaxConn: 10,
		RedisDB:         0,
		ShutdownTimeout: 10 * time.Second,
	}

	dbURL, err := requireEnv("DATABASE_URL")
	if err != nil {
		return nil, err
	}
	cfg.DatabaseURL = dbURL

	adminKey, err := requireEnv("ADMIN_API_KEY")
	if err != nil {
		return nil, err
	}
	cfg.AdminAPIKey = adminKey

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
