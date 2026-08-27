# Unity Runn Club — Project Progress

Last updated: 2026-08-26
Current branch: `phase-7-admin-panel`
Status: Phase 7 stabilization and production-readiness work in progress

## Project summary

Unity Runn Club is a full-stack event registration and race-operations platform.

- Backend: Go modular monolith using Chi, PostgreSQL, Redis and structured logging
- Frontend: Next.js 16 Pages Router, React 19, TypeScript and Tailwind CSS
- Realtime: Socket.IO gateway with Redis Pub/Sub
- Media storage: Cloudflare R2 with a local filesystem fallback
- Payments: Bakong KHQR integration with a development mock provider
- Email: Gmail SMTP with asynchronous Redis/PostgreSQL delivery workers

## Current health

The stack was operational at the latest live verification. The API, PostgreSQL, Redis, and realtime containers were healthy on 2026-08-26; backend tests/vet and frontend lint/build also passed.

| Component | Current state |
|---|---|
| Go API | Operational |
| PostgreSQL | Operational at last live check; migration 26 is the latest schema migration |
| Redis | Operational |
| Cloudflare R2 | Operational and reachable |
| Socket.IO | Operational and healthy on port 8081 |
| Gmail SMTP | Configured |
| Google OAuth | Configured |
| Payments | Mock provider active; production Bakong credentials still required |
| Notification queue | No pending or failed messages during the latest check |
| Automated backups | Not configured |

The sanitized live report is available to Super Admins at `/admin/system`.

## Completed platform capabilities

### Foundation and security

- PostgreSQL and Redis connection management with bounded readiness checks
- Graceful API shutdown and structured request logging
- Security headers, restricted credentialed CORS and request-size limits
- JWT access tokens with rotating HttpOnly refresh-token cookies
- Password hashing with configurable bcrypt cost
- Role hierarchy: `USER`, `STAFF`, `ADMIN`, `SUPER_ADMIN`
- Login attempt limiting and audited privileged operations
- Google OAuth account linking and sign-in
- Normalized, case-insensitive user email uniqueness

### Events and registration

- Complete event lifecycle and status transitions
- Event categories, prices, capacity, schedules, FAQs and rules
- Configurable poster artboard (portrait, classic, square, landscape, story, or custom) with zoom/position controls and server-enforced JPEG normalization for R2/local storage
- Automatically generated card and hero poster variants, with backward-compatible original-image fallback on public pages
- Resumable event-creation drafts in the admin interface
- Registration deadlines and availability reporting
- Transaction-safe capacity enforcement
- One active registration per user and event
- Registration cancellation rules
- Stable ticket numbers and QR ticket tokens

### Payments

- Bakong KHQR payload generation
- Server-side payment verification
- Payment checkout expiry and settlement state
- USD/KHR currency stored per ticket category and enforced through checkout verification
- Failed payment initialization releases the reserved capacity slot
- PostgreSQL-leased background reconciliation confirms payments without browser polling
- Mock provider for local development
- Ticket and payment documents attached to transactional emails

Production Bakong activation still requires certified merchant credentials and a complete test-environment transaction.

### Tickets and check-in

- Participant ticket wallet
- Full ticket-card PNG download with embedded QR code
- QR, camera, USB scanner and manual registration-number check-in
- Correct-event validation
- Duplicate check-in prevention at both service and database levels
- Race-day sound feedback and recent-arrival feed
- Camera retry and facing-mode handling

### Notifications

- Registration confirmation
- Payment confirmation
- Registration cancellation
- Event update
- Event reminder
- Redis queue with PostgreSQL recovery sweep
- Retry limits and failure tracking
- Expiring worker heartbeat with live/stale status in the System console
- Branded HTML and text email templates
- Ticket/payment document attachments
- Gmail SMTP delivery with a safe log-only fallback

### Public website

- Responsive public navigation and authenticated session awareness
- Homepage hero carousel
- Interactive About-page photo carousel reusing the administrator-managed club image set
- Interactive event calendar and event detail pages
- Event poster artwork with intentional no-image fallbacks
- Adaptive public poster rendering preserves every selected artboard ratio with an uncropped foreground and ambient edge-to-edge backdrop
- Event detail uses a responsive poster-and-entry-board hero that keeps artwork uncropped while moving race facts and the primary registration action above the fold
- Registration and payment flow
- Task-focused runner dashboard with payment-first prioritization, quick navigation, ticket/QR access, and clearly ordered registration history
- Animated, event-specific announcement strip
- Public cookie preferences with essential-only and accept-all choices plus a persistent footer control
- Public-site typography and responsive design system

### Public-site administration

Administrators can manage:

- Club name, location and logo
- Primary, accent and background colors
- Event-specific announcement text and destination
- Homepage introduction and headline
- Mission and supporting copy
- Primary call to action and footer
- Value statements
- One-to-six hero carousel slides and images
- Immutable design-version history and restores

Published changes are delivered immediately to connected public pages through Socket.IO. Reconnecting browsers reload the authoritative PostgreSQL version so missed Pub/Sub messages do not leave the site stale.

### Admin operations

- Operations dashboard with database-backed metrics
- Event calendar and event editor
- Runner roster, filters, participant details and CSV export
- Race-day check-in station
- Audit log
- Super Admin role management with self-demotion protection
- Public-site design editor and version ledger
- Super Admin system configuration and health console

The system console reports sanitized runtime configuration, PostgreSQL pool and size, Redis memory and queues, R2 connectivity, Socket.IO, SMTP, OAuth, payments, security posture, background workers and backup readiness. Secret values never reach the browser.

## Data and infrastructure

Current PostgreSQL schema migrations:

- `00001`–`00017`: core platform, events, users, registrations, payments, tickets, check-in, audit and notifications
- `00018`: hardened registration relationships
- `00019`: payment checkout data
- `00020`: normalized user email uniqueness
- `00021`: public-site settings
- `00022`: public-site version history
- `00023`: OAuth identities
- `00024`: event association for public announcements
- `00025`: per-event category-name uniqueness
- `00026`: category currency and leased payment-reconciliation state/indexes

Docker Compose currently runs:

- PostgreSQL 16
- Redis 7
- Go API on port 8080
- Socket.IO gateway on port 8081

The local profile has conservative, environment-overridable resource ceilings: 256 MB for PostgreSQL, 256 MB for the API, 96 MB for Redis, and 96 MB for Socket.IO. PostgreSQL uses a reduced working set, Redis is capped without eviction, Go and Node heaps are bounded, health probes are less frequent, and container logs rotate. Backend build context exclusions also prevent local binaries, tests, migrations, and developer utilities from being copied into the API image build.

The frontend runs separately on port 3000 during local development.

## Verification completed

- GitHub Actions CI runs on every pull request and on pushes to `main` (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml))
- Go unit tests pass across all backend packages
- Backend integration tests run in CI against PostgreSQL 16 with migrations applied
- `go vet ./...` and `gofmt` checks pass
- Frontend ESLint completes with no errors
- Frontend production build completes successfully
- Playwright journeys pass in desktop Chromium and a mobile Pixel 7 viewport for public event discovery/poster rendering, the About gallery, runner-dashboard payment prioritization, cookie preferences, admin login persistence, and poster-artboard editing
- Realtime gateway syntax check passes
- Notification worker startup heartbeat and stale-heartbeat classification tests pass
- Payment initialization compensation, currency propagation, background settlement and expiry tests pass
- Docker Compose configuration validates
- Compose resource limits render correctly for every service
- PostgreSQL, Redis, API and Socket.IO health checks pass
- R2 bucket connectivity passes
- Socket.IO delivery and origin restrictions were tested
- Super Admin system endpoint returns sanitized results
- Staff access to the system endpoint returns `403`
- Anonymous access returns `401`
- System console and public-site behavior were visually checked in-browser

## Known gaps and risks

1. Production Bakong credentials and certification are incomplete.
2. Automated PostgreSQL and R2 backups are not configured.
3. Production deployment and reverse-proxy configuration are not finalized.
4. Production build version and Git commit metadata are not embedded yet.
5. External monitoring, alerting and error tracking are not configured.
6. `check_ins.staff_user_id` still needs a long-term soft-delete or `ON DELETE` policy for former staff accounts.
7. The repository currently contains a large uncommitted stabilization set; preserve unrelated work and review it before committing.

## Recommended next priorities

1. Add automated PostgreSQL and R2 backup policies with restore testing.
2. Configure Bakong test credentials and complete an end-to-end payment verification.
3. Define production hosting, HTTPS, reverse proxying and environment-specific secrets.
4. Add build version/commit metadata to the API and System console.
5. Add external error monitoring and alert delivery.
6. Enable required status checks and branch protection on `main` in GitHub.

## Local development

```bash
cd /Users/dara/development/Unity-RUNN
cp .env.example .env
docker compose up -d --build
make migrate
make seed

cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Local endpoints:

- Public frontend: `http://localhost:3000`
- API health: `http://localhost:8080/health`
- API readiness: `http://localhost:8080/ready`
- Socket.IO health: `http://localhost:8081/health`
- Admin dashboard: `http://localhost:3000/admin`
- Super Admin system console: `http://localhost:3000/admin/system`

## Useful checks

```bash
cd backend
go test ./...
go vet ./...

cd ../frontend
npm run lint
npm run build
npm run test:e2e

cd ..
docker compose config --quiet
docker compose ps
```

Never place real JWT secrets, SMTP passwords, OAuth secrets, Bakong tokens or R2 credentials in this document or commit them to source control.
