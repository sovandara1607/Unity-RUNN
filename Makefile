.PHONY: dev dev-down dev-logs test lint fmt vet migrate seed build run

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

# Run the Go test suite.
test:
	cd backend && go test ./... -race -count=1

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

# Goose migrations arrive in Phase 2 — placeholders for now.
migrate:
	@echo "No migrations yet — added in Phase 2 (database + event domain)."

seed:
	@echo "No seed data yet — added in Phase 2 (database + event domain)."
