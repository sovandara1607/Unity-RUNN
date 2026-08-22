package config

import (
	"os"
	"testing"
)

// withEnv sets env vars for the duration of the test and restores the
// previous environment afterwards.
func withEnv(t *testing.T, kv map[string]string) {
	t.Helper()
	for k, v := range kv {
		t.Setenv(k, v)
	}
}

func clearAll(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"APP_ENV", "PORT", "LOG_LEVEL", "DATABASE_URL", "DATABASE_MAX_CONN",
		"REDIS_ADDR", "REDIS_PASSWORD", "REDIS_DB", "CORS_ALLOWED_ORIGINS",
	} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}
}

func TestLoad_ValidEnv(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"APP_ENV":              "production",
		"PORT":                 "9090",
		"DATABASE_URL":         "postgres://user:pass@localhost:5432/unity",
		"DATABASE_MAX_CONN":    "25",
		"REDIS_ADDR":           "redis:6379",
		"REDIS_DB":             "2",
		"CORS_ALLOWED_ORIGINS": "https://unityrunclub.com, https://admin.unityrunclub.com",
	})

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned unexpected error: %v", err)
	}

	if cfg.AppEnv != "production" {
		t.Errorf("AppEnv = %q, want %q", cfg.AppEnv, "production")
	}
	if cfg.Port != "9090" {
		t.Errorf("Port = %q, want %q", cfg.Port, "9090")
	}
	if cfg.DatabaseURL != "postgres://user:pass@localhost:5432/unity" {
		t.Errorf("DatabaseURL = %q, unexpected", cfg.DatabaseURL)
	}
	if cfg.DatabaseMaxConn != 25 {
		t.Errorf("DatabaseMaxConn = %d, want 25", cfg.DatabaseMaxConn)
	}
	if cfg.RedisAddr != "redis:6379" {
		t.Errorf("RedisAddr = %q, want %q", cfg.RedisAddr, "redis:6379")
	}
	if cfg.RedisDB != 2 {
		t.Errorf("RedisDB = %d, want 2", cfg.RedisDB)
	}
	want := []string{"https://unityrunclub.com", "https://admin.unityrunclub.com"}
	if len(cfg.CORSAllowedOrigins) != len(want) {
		t.Fatalf("CORSAllowedOrigins = %v, want %v", cfg.CORSAllowedOrigins, want)
	}
	for i := range want {
		if cfg.CORSAllowedOrigins[i] != want[i] {
			t.Errorf("CORSAllowedOrigins[%d] = %q, want %q", i, cfg.CORSAllowedOrigins[i], want[i])
		}
	}
}

func TestLoad_MissingRequiredVar(t *testing.T) {
	clearAll(t)
	// DATABASE_URL intentionally left unset.

	_, err := Load()
	if err == nil {
		t.Fatal("Load() expected error for missing DATABASE_URL, got nil")
	}
}

func TestLoad_Defaults(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL": "postgres://user:pass@localhost:5432/unity",
	})

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned unexpected error: %v", err)
	}

	if cfg.AppEnv != "development" {
		t.Errorf("AppEnv default = %q, want %q", cfg.AppEnv, "development")
	}
	if cfg.Port != "8080" {
		t.Errorf("Port default = %q, want %q", cfg.Port, "8080")
	}
	if cfg.LogLevel != "info" {
		t.Errorf("LogLevel default = %q, want %q", cfg.LogLevel, "info")
	}
	if cfg.DatabaseMaxConn != 10 {
		t.Errorf("DatabaseMaxConn default = %d, want 10", cfg.DatabaseMaxConn)
	}
	if cfg.RedisAddr != "localhost:6379" {
		t.Errorf("RedisAddr default = %q, want %q", cfg.RedisAddr, "localhost:6379")
	}
	if len(cfg.CORSAllowedOrigins) != 1 || cfg.CORSAllowedOrigins[0] != "http://localhost:3000" {
		t.Errorf("CORSAllowedOrigins default = %v, want [http://localhost:3000]", cfg.CORSAllowedOrigins)
	}
}

func TestLoad_InvalidIntVars(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL":      "postgres://user:pass@localhost:5432/unity",
		"DATABASE_MAX_CONN": "not-a-number",
	})

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected error for invalid DATABASE_MAX_CONN, got nil")
	}
}
