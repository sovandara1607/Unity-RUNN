package systemstatus

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/unity-run-club/api/internal/config"
)

func TestSnapshotNeverContainsSecrets(t *testing.T) {
	cfg := &config.Config{
		AppEnv: "development", LogLevel: "info", DatabaseURL: "postgres://secret-user:database-password@localhost:5432/unity",
		RedisAddr: "localhost:6379", RedisPassword: "redis-password", RealtimeInternalURL: "http://127.0.0.1:1",
		ObjectStorageProvider: "r2", R2Endpoint: "https://account.r2.cloudflarestorage.com", R2Bucket: "media",
		R2AccessKeyID: "storage-access-id", R2SecretAccessKey: "storage-secret", JWTSecret: "jwt-secret-value",
		SMTPHost: "smtp.gmail.com", SMTPPort: 587, SMTPPassword: "smtp-secret", SMTPFrom: "admin@example.com",
		GoogleOAuthClientID: "google-client-identifier", GoogleOAuthClientSecret: "google-secret", GoogleOAuthRedirectURL: "http://localhost/callback",
		PaymentProvider: "bakong", BakongToken: "bakong-secret", BakongAccountID: "merchant-account-value", BakongMerchantID: "merchant-identifier",
		AccessTokenTTL: 15 * time.Minute, RefreshTokenTTL: 30 * 24 * time.Hour, CORSAllowedOrigins: []string{"http://localhost:3000"},
	}
	raw, err := json.Marshal(NewService(cfg, nil, nil, nil).Snapshot(context.Background()))
	if err != nil {
		t.Fatal(err)
	}
	serialized := string(raw)
	for _, secret := range []string{"database-password", "redis-password", "storage-access-id", "storage-secret", "jwt-secret-value", "smtp-secret", "google-secret", "bakong-secret", "merchant-account-value"} {
		if strings.Contains(serialized, secret) {
			t.Fatalf("snapshot exposed secret %q", secret)
		}
	}
}

func TestMaskIdentifier(t *testing.T) {
	if got := maskIdentifier("abcdefghijklmnop"); got != "abcd…mnop" {
		t.Fatalf("maskIdentifier() = %q", got)
	}
}
