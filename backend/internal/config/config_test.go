package config

import (
	"os"
	"testing"
	"time"
)

// withEnv sets env vars for the duration of the test and restores the previous environment afterwards
func withEnv(t *testing.T, kv map[string]string) {
	t.Helper()
	for k, v := range kv {
		t.Setenv(k, v)
	}
}

// clearAll clears all env vars
func clearAll(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"APP_ENV", "PORT", "LOG_LEVEL", "DATABASE_URL", "DATABASE_MAX_CONN", "JWT_SECRET",
		"ACCESS_TOKEN_TTL", "REFRESH_TOKEN_TTL", "BCRYPT_COST",
		"REDIS_ADDR", "REDIS_PASSWORD", "REDIS_DB", "CORS_ALLOWED_ORIGINS",
		"OBJECT_STORAGE_PROVIDER", "R2_ENDPOINT", "R2_ACCESS_KEY_ID",
		"R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL",
		"SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM",
		"PUBLIC_APP_URL", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URL",
	} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}
}

// TestLoad_GoogleOAuthAndSMTP tests the Load method that loads Google OAuth and SMTP config
func TestLoad_GoogleOAuthAndSMTP(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL": "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":   "development-secret",
		"SMTP_HOST":    "smtp.gmail.com", "SMTP_PORT": "587",
		"SMTP_USER": "club@example.com", "SMTP_PASSWORD": "app-password", "SMTP_FROM": "club@example.com",
		"GOOGLE_OAUTH_CLIENT_ID": "client-id", "GOOGLE_OAUTH_CLIENT_SECRET": "client-secret",
		"GOOGLE_OAUTH_REDIRECT_URL": "http://localhost:8080/api/v1/auth/google/callback",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned unexpected error: %v", err)
	}
	if cfg.SMTPHost != "smtp.gmail.com" || cfg.GoogleOAuthClientID != "client-id" {
		t.Fatalf("Google config not loaded: %#v", cfg)
	}
}

// TestLoad_RejectsPartialGoogleAndSMTPConfig tests the Load method that rejects partial Google and SMTP config
func TestLoad_RejectsPartialGoogleAndSMTPConfig(t *testing.T) {
	for name, values := range map[string]map[string]string{
		"google": {"GOOGLE_OAUTH_CLIENT_ID": "client-id"},
		"smtp":   {"SMTP_HOST": "smtp.gmail.com"},
	} {
		t.Run(name, func(t *testing.T) {
			clearAll(t)
			values["DATABASE_URL"] = "postgres://user:pass@localhost:5432/unity"
			values["JWT_SECRET"] = "development-secret"
			withEnv(t, values)
			if _, err := Load(); err == nil {
				t.Fatal("Load() accepted partial provider configuration")
			}
		})
	}
}

// TestLoad_R2Storage tests the Load method that loads R2 storage config
func TestLoad_R2Storage(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL":            "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":              "development-secret",
		"OBJECT_STORAGE_PROVIDER": "r2",
		"R2_ENDPOINT":             "https://5c9a0fa93f233126f351e90ba5c88e74.r2.cloudflarestorage.com/unity-runn-club",
		"R2_ACCESS_KEY_ID":        "access-key",
		"R2_SECRET_ACCESS_KEY":    "secret-key",
		"R2_BUCKET":               "unity-runn-club",
		"R2_PUBLIC_BASE_URL":      "https://assets.unityrunn.club",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned unexpected error: %v", err)
	}
	if cfg.ObjectStorageProvider != "r2" || cfg.R2Bucket != "unity-runn-club" {
		t.Fatalf("R2 config = provider %q, bucket %q", cfg.ObjectStorageProvider, cfg.R2Bucket)
	}
}

// TestLoad_R2StorageRequiresCredentials tests the Load method that rejects incomplete R2 storage config
func TestLoad_R2StorageRequiresCredentials(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL":            "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":              "development-secret",
		"OBJECT_STORAGE_PROVIDER": "r2",
		"R2_ENDPOINT":             "https://account.r2.cloudflarestorage.com",
		"R2_BUCKET":               "unity-runn-club",
	})
	if _, err := Load(); err == nil {
		t.Fatal("Load() accepted incomplete R2 configuration")
	}
}

// TestLoad_R2StorageDefaultsToPrivateBucketProxy tests the Load method that defaults to private bucket proxy
func TestLoad_R2StorageDefaultsToPrivateBucketProxy(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL":            "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":              "development-secret",
		"OBJECT_STORAGE_PROVIDER": "r2",
		"R2_ENDPOINT":             "https://account.r2.cloudflarestorage.com/unity-runn-club",
		"R2_ACCESS_KEY_ID":        "access-key",
		"R2_SECRET_ACCESS_KEY":    "secret-key",
		"R2_BUCKET":               "unity-runn-club",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned unexpected error: %v", err)
	}
	if cfg.R2PublicBaseURL != "/api/v1/media" {
		t.Fatalf("R2PublicBaseURL = %q", cfg.R2PublicBaseURL)
	}
}

// TestLoad_ValidEnv tests the Load method that loads valid environment config
func TestLoad_ValidEnv(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"APP_ENV":              "production",
		"PORT":                 "9090",
		"DATABASE_URL":         "postgres://user:pass@localhost:5432/unity",
		"DATABASE_MAX_CONN":    "25",
		"JWT_SECRET":           "production-test-secret-with-32-characters",
		"ACCESS_TOKEN_TTL":     "5m",
		"REFRESH_TOKEN_TTL":    "168h",
		"BCRYPT_COST":          "12",
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
	if cfg.JWTSecret != "production-test-secret-with-32-characters" {
		t.Errorf("JWTSecret = %q, unexpected", cfg.JWTSecret)
	}
	if cfg.AccessTokenTTL != 5*time.Minute {
		t.Errorf("AccessTokenTTL = %v, want %v", cfg.AccessTokenTTL, 5*time.Minute)
	}
	if cfg.RefreshTokenTTL != 168*time.Hour {
		t.Errorf("RefreshTokenTTL = %v, want %v", cfg.RefreshTokenTTL, 168*time.Hour)
	}
	if cfg.BcryptCost != 12 {
		t.Errorf("BcryptCost = %d, want 12", cfg.BcryptCost)
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

// TestLoad_MissingDatabaseURL tests the Load method that rejects missing DATABASE_URL
func TestLoad_MissingDatabaseURL(t *testing.T) {
	clearAll(t)
	// DATABASE_URL intentionally left unset.
	withEnv(t, map[string]string{"JWT_SECRET": "s3cret"})

	_, err := Load()
	if err == nil {
		t.Fatal("Load() expected error for missing DATABASE_URL, got nil")
	}
}

// TestLoad_MissingJWTSecret tests the Load method that rejects missing JWT_SECRET
func TestLoad_MissingJWTSecret(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{"DATABASE_URL": "postgres://user:pass@localhost:5432/unity"})
	// JWT_SECRET intentionally left unset.

	_, err := Load()
	if err == nil {
		t.Fatal("Load() expected error for missing JWT_SECRET, got nil")
	}
}

// TestLoad_Defaults tests the Load method that loads default config
func TestLoad_Defaults(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL": "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":   "s3cret",
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
	if cfg.AccessTokenTTL != 15*time.Minute {
		t.Errorf("AccessTokenTTL default = %v, want %v", cfg.AccessTokenTTL, 15*time.Minute)
	}
	if cfg.RefreshTokenTTL != 30*24*time.Hour {
		t.Errorf("RefreshTokenTTL default = %v, want %v", cfg.RefreshTokenTTL, 30*24*time.Hour)
	}
	if cfg.BcryptCost != 12 {
		t.Errorf("BcryptCost default = %d, want 12", cfg.BcryptCost)
	}
	if cfg.RedisAddr != "localhost:6379" {
		t.Errorf("RedisAddr default = %q, want %q", cfg.RedisAddr, "localhost:6379")
	}
	if len(cfg.CORSAllowedOrigins) != 1 || cfg.CORSAllowedOrigins[0] != "http://localhost:3000" {
		t.Errorf("CORSAllowedOrigins default = %v, want [http://localhost:3000]", cfg.CORSAllowedOrigins)
	}
}

// TestLoad_InvalidIntVars tests the Load method that rejects invalid DATABASE_MAX_CONN
func TestLoad_InvalidIntVars(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL":      "postgres://user:pass@localhost:5432/unity",
		"DATABASE_MAX_CONN": "not-a-number",
		"JWT_SECRET":        "s3cret",
	})

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected error for invalid DATABASE_MAX_CONN, got nil")
	}
}

// TestLoad_InvalidDurationVars tests the Load method that rejects invalid ACCESS_TOKEN_TTL
func TestLoad_InvalidDurationVars(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL":     "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":       "s3cret",
		"ACCESS_TOKEN_TTL": "not-a-duration",
	})

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected error for invalid ACCESS_TOKEN_TTL, got nil")
	}
}

// TestLoad_RejectsWeakProductionJWTSecret tests the Load method that rejects a weak production JWT secret
func TestLoad_RejectsWeakProductionJWTSecret(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"APP_ENV":              "production",
		"DATABASE_URL":         "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":           "too-short",
		"CORS_ALLOWED_ORIGINS": "https://unityrunclub.com",
	})
	if _, err := Load(); err == nil {
		t.Fatal("Load() accepted a weak production JWT secret")
	}
}

// TestLoad_RejectsDefaultJWTSecretInDevelopment tests the Load method that rejects the default JWT secret in development
func TestLoad_RejectsDefaultJWTSecretInDevelopment(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL": "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":   "dev-jwt-secret-change-me",
	})
	if _, err := Load(); err == nil {
		t.Fatal("Load() accepted the development JWT placeholder")
	}
}

// TestLoad_RejectsWeakStagingJWTSecret tests the Load method that rejects a weak staging JWT secret
func TestLoad_RejectsWeakStagingJWTSecret(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"APP_ENV":              "staging",
		"DATABASE_URL":         "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":           "too-short",
		"CORS_ALLOWED_ORIGINS": "https://staging.unityrunclub.com",
	})
	if _, err := Load(); err == nil {
		t.Fatal("Load() accepted a weak staging JWT secret")
	}
}

// TestLoad_RejectsWeakProductionBcryptCost tests the Load method that rejects a weak production bcrypt cost
func TestLoad_RejectsWeakProductionBcryptCost(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"APP_ENV":              "production",
		"DATABASE_URL":         "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":           "production-test-secret-with-32-characters",
		"BCRYPT_COST":          "10",
		"CORS_ALLOWED_ORIGINS": "https://unityrunclub.com",
	})
	if _, err := Load(); err == nil {
		t.Fatal("Load() accepted a weak production bcrypt cost")
	}
}

// TestLoad_RejectsWildcardCORSWithCredentials tests the Load method that rejects a wildcard CORS origin
func TestLoad_RejectsWildcardCORSWithCredentials(t *testing.T) {
	clearAll(t)
	withEnv(t, map[string]string{
		"DATABASE_URL":         "postgres://user:pass@localhost:5432/unity",
		"JWT_SECRET":           "development-secret",
		"CORS_ALLOWED_ORIGINS": "*",
	})
	if _, err := Load(); err == nil {
		t.Fatal("Load() accepted wildcard CORS origin")
	}
}
