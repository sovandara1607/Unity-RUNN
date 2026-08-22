.PHONY: dev dev-down dev-logs test test-integration lint fmt vet migrate migrate-down seed build run

# Load .env (if present) so `make run/migrate/seed` see DATABASE_URL,
# ADMIN_API_KEY, etc. without requiring the caller to export them.
ifneq (,$(wildcard .env))
include .env
export
endif

# Bring up Postgres, Redis, and the API via docker-compose.
dev:
	docker compose up --build

# Bring up only the infra services (Postgres, Redis) for local `go run`.
dev-infra:
	docker compose up -d postgres redis

dev-down:
	docker compose down

dev-logs:
	docker compose logs -f

# Run the Go test suite (unit tests only — no database required).
test:
	cd backend && go test ./... -race -count=1

# Run tests that need a real PostgreSQL (repository integration
# tests). Requires `make dev-infra` (or `make dev`) running first.
test-integration:
	cd backend && go test -tags=integration ./... -race -count=1

# go vet + gofmt check (fails if any file is unformatted).
lint: vet
	cd backend && test -z "$$(gofmt -l .)" || (echo "gofmt found unformatted files:"; gofmt -l .; exit 1)

fmt:
	cd backend && go fmt ./...

vet:
	cd backend && go vet ./...

build:
	cd backend && go build -o bin/server ./cmd/server

run:
	cd backend && go run ./cmd/server

migrate:
	cd backend && go run ./cmd/migrate up

migrate-down:
	cd backend && go run ./cmd/migrate down

seed:
	cd backend && go run ./cmd/seed
