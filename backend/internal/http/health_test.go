package http

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// fakePinger is a test double for Pinger.
type fakePinger struct {
	err error
}

func TestFilesOnlyFS_DisablesDirectoryListing(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "events"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "events", "poster.png"), []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	secureFS := filesOnlyFS{root: http.Dir(root)}
	if dir, err := secureFS.Open("/events"); err == nil {
		_ = dir.Close()
		t.Fatal("directory opened successfully; listing should be disabled")
	}
	file, err := secureFS.Open("/events/poster.png")
	if err != nil {
		t.Fatalf("open uploaded file: %v", err)
	}
	_ = file.Close()
}

func (f fakePinger) Ping(ctx context.Context) error {
	return f.err
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestHealthHandler_AlwaysOK(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	healthHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var body healthResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Status != "ok" {
		t.Errorf("status = %q, want %q", body.Status, "ok")
	}
}

func TestReadyHandler_AllDependenciesHealthy(t *testing.T) {
	deps := Deps{
		Logger: discardLogger(),
		DB:     fakePinger{},
		Redis:  fakePinger{},
	}

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	rec := httptest.NewRecorder()

	readyHandler(deps)(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var body readyResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Status != "ok" {
		t.Errorf("status = %q, want %q", body.Status, "ok")
	}
	if body.Dependencies["postgres"] != "ok" || body.Dependencies["redis"] != "ok" {
		t.Errorf("dependencies = %+v, want both ok", body.Dependencies)
	}
}

func TestReadyHandler_DependencyDown(t *testing.T) {
	deps := Deps{
		Logger: discardLogger(),
		DB:     fakePinger{},
		Redis:  fakePinger{err: errors.New("connection refused")},
	}

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	rec := httptest.NewRecorder()

	readyHandler(deps)(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusServiceUnavailable, rec.Body.String())
	}

	var body readyResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Status != "unavailable" {
		t.Errorf("status = %q, want %q", body.Status, "unavailable")
	}
	if body.Dependencies["postgres"] != "ok" {
		t.Errorf("postgres = %q, want ok", body.Dependencies["postgres"])
	}
	if body.Dependencies["redis"] != "unhealthy" {
		t.Errorf("redis = %q, want unhealthy", body.Dependencies["redis"])
	}
}

func TestReadyHandler_DependencyNotConfigured(t *testing.T) {
	deps := Deps{
		Logger: discardLogger(),
		DB:     fakePinger{},
		Redis:  nil,
	}

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	rec := httptest.NewRecorder()

	readyHandler(deps)(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var body readyResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Dependencies["redis"] != "not_configured" {
		t.Errorf("redis = %q, want not_configured", body.Dependencies["redis"])
	}
}
