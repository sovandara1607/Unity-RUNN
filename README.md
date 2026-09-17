# Unity Runn Club

[![CI](https://github.com/sovandara1607/Unity-RUNN/actions/workflows/ci.yml/badge.svg)](https://github.com/sovandara1607/Unity-RUNN/actions/workflows/ci.yml)

Unity Runn Club brings the work of running a community race into one place. Runners can find an event, sign up, pay, and keep their ticket ready for race day. Organizers can publish events, manage registrations, and check people in by scanning their QR codes.

The project includes a public website, an admin panel, and an Expo mobile app. The web app uses Next.js 16, backed by a Go API, PostgreSQL, Redis, and a Socket.IO service for live updates.

It's still under active development. [progress.md](./progress.md) tracks completed features and known gaps; check its last-updated date when using it as a reference.

## Run it locally

You'll need Docker with Compose, Go 1.25.7 or newer, Node.js 22 with npm, and Make. Docker runs the backend services; Go is needed locally for the migration and seed commands below.

Start in the repository root and create your backend configuration:

```bash
cp .env.example .env
openssl rand -hex 48
```

Copy the generated value into `JWT_SECRET` in `.env`. The other defaults are enough to get started: uploads stay in local storage, emails are logged, and payments use the mock provider. Keep `.env` and real credentials out of Git.

Start PostgreSQL and Redis, then prepare the database before bringing up the rest of the services:

```bash
docker compose up -d --wait postgres redis
make migrate
make seed
docker compose up -d --build
```

The seed command creates a demo event and prints the demo account credentials. Use those accounts to try the runner and admin flows.

Now start the website:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000) for the public site or [localhost:3000/admin](http://localhost:3000/admin) for the admin panel.

The API is available at `http://localhost:8080` and Socket.IO at `http://localhost:8081`. Use [`/ready`](http://localhost:8080/ready) to check the API's database and Redis connections, or [`/health`](http://localhost:8080/health) to check that the API process is responding.

Compose runs two API instances behind a Traefik gateway and one worker for background jobs. The [load-balancing guide](./deploy/load-balancing.md) explains how they're connected.

## Day-to-day development

Run these from the repository root:

```bash
make dev                # Build and run the Docker services with logs attached
make dev-down           # Stop the Docker services
make dev-logs           # Follow the service logs
make migrate            # Apply pending database migrations
make seed               # Create or refresh the demo data
make test               # Run Go unit tests with the race detector
make lint               # Run go vet and check Go formatting
```

`make test-integration` runs the repository tests against the database in `DATABASE_URL`. These tests clear tables, so use a disposable database with migrations applied.

For the frontend checks:

```bash
cd frontend
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts the frontend dev server automatically, or reuses one already running locally. Keep the backend services running for tests that use the API.

To check the Socket.IO server's syntax, run `npm run check` from `realtime/`.

## Roles

Access follows four levels: `USER`, `STAFF`, `ADMIN`, and `SUPER_ADMIN`. Each role inherits the permissions of the one before it. The API enforces these permissions.

## Where things live

```text
backend/     Go API, background jobs, database migrations, and seed data
frontend/    Next.js public website and admin panel
mobile/      Expo / React Native app for runners
realtime/    Socket.IO service for live updates
deploy/      Deployment configuration and verification tools
docs/        Architecture notes and integration guides
```

## Further reading

- [Project progress](./progress.md) — feature status, previous checks, and known gaps
- [Development notes](./continue.md) — context for picking up ongoing work
- [Frontend README](./frontend/README.md) — notes specific to the website
- [Google services](./docs/google-services.md) — Google sign-in and Gmail SMTP setup
- [API load balancing](./deploy/load-balancing.md) — routing, background workers, and failover checks
- [Scaling and registration-burst safety](./docs/scaling.md) — concurrency strategy, PgBouncer, rate limiting, and load testing
- [Dokploy staging and client preview](./deploy/dokploy.md) — deployment and client test link setup
- [Backend configuration](./.env.example), [frontend configuration](./frontend/.env.example), and [mobile configuration](./mobile/.env.example) — environment variable examples

If you change how something works, update the relevant docs alongside the code so the next person has a reliable place to start.
