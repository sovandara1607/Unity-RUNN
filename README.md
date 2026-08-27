# Unity Runn Club

[![CI](https://github.com/sovandara1607/Unity-RUNN/actions/workflows/ci.yml/badge.svg)](https://github.com/sovandara1607/Unity-RUNN/actions/workflows/ci.yml)

Event-management platform for community races: publish an event, take registrations and payment, deliver a ticket, and check runners in with a QR scan.

Stack: Next.js 16 (public site + admin panel), Go 1.25 API, Socket.IO realtime gateway, PostgreSQL, Redis. Under active development — see [progress.md](./progress.md) for what's done and what's not.

## Quick start

```bash
# 1. Configure the backend
cp .env.example .env
openssl rand -hex 48   # paste into JWT_SECRET in .env

# 2. Start infrastructure and services
docker compose up -d --build
make migrate
make seed               # prints local demo accounts

# 3. Start the frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (admin at `/admin`). API health: [http://localhost:8080/health](http://localhost:8080/health).

Defaults are local-dev safe: file uploads use local storage, email logs instead of sending, and payments use a mock provider. Never commit `.env` or real credentials.

## Common commands

```bash
make dev               # build and run Postgres, Redis, API, realtime
make dev-down           # stop local containers
make migrate            # apply pending migrations
make seed                # seed local event and account data
make test                # Go unit tests
make test-integration    # repository tests against Postgres
make lint                 # go vet + gofmt check
```

```bash
cd frontend && npm run lint && npm run build && npm run test:e2e
cd realtime && npm run check
```

## Roles

`USER` < `STAFF` < `ADMIN` < `SUPER_ADMIN` — each inherits the level below it. Enforced by the API, not just the UI.

## Project layout

```text
backend/     Go API, migrations, seed and email utilities
frontend/    Next.js public site + admin panel
realtime/    Socket.IO gateway
docs/        integration guides (Google OAuth, Gmail SMTP)
```

## More docs

- [progress.md](./progress.md) — capabilities, verification, known gaps
- [continue.md](./continue.md) — implementation continuation notes
- [docs/google-services.md](./docs/google-services.md) — Google OAuth + Gmail SMTP setup
- [frontend/README.md](./frontend/README.md) — frontend-specific notes
- [.env.example](./.env.example) / [frontend/.env.example](./frontend/.env.example) — full configuration reference

When docs and code disagree, the code and migrations win — update the docs in the same change.
