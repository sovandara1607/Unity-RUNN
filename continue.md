# Unity Run Club — Progress & Continuation Notes

Last updated: 2026-08-24 (Phase 7 stabilization in progress)

## Where things stand

Full-stack application: Go modular-monolith API in `backend/` and a Next.js
Pages Router application in `frontend/`.

The current history is linear through Phase 7. `main` contains Phases 1–6 and
the continuation-note commit; Phase 7 is stacked on top:

```
phase-1 → phase-2 → phase-3 → phase-4 → phase-5 → phase-6 → main
                                                            └─ phase-7-admin-panel ← current branch
```

Current branch: `phase-7-admin-panel`. The branch has committed Phase 7 work plus
an active uncommitted stabilization pass; check `git status` before editing or
committing so the in-progress changes are preserved.

## What's built

- **Foundation**: Chi router, structured JSON logging, pgx/Redis connections, graceful shutdown, `/health` + `/ready`.
- **Events**: full CRUD, status lifecycle (`DRAFT → PUBLISHED → REGISTRATION_OPEN → REGISTRATION_CLOSED → COMPLETED`, plus `CANCELLED`/`ARCHIVED`), categories/schedule/FAQs/rules.
- **Auth**: register/login/refresh/logout, JWT access token + rotating refresh-token cookie, `USER < STAFF < ADMIN < SUPER_ADMIN` RBAC.
- **Registrations**: `SELECT ... FOR UPDATE`-based capacity safety (proven under real concurrency), one-active-registration-per-user-per-event, Redis lock/availability-cache/rate-limit, Bakong KHQR checkout with server-side settlement verification, and QR ticket tokens.
- **Check-in**: QR token verification, one-check-in-per-registration (DB-enforced), admin registration listing, audit log.
- **Notifications**: all 5 email types (registration confirmation, payment confirmation, cancellation, event update, event reminder), async via a Redis-queued/Postgres-swept worker, SMTP optional (logs instead of sending when unconfigured).
- **Frontend**: public event discovery/details, authenticated registration,
  participant race wallet, stable downloadable QR codes, and a role-guarded
  race-control panel.
- **Public-site customization**: administrators can publish the public logo,
  brand colors, announcement banner, hero copy and carousel artwork/order,
  mission/value messaging, primary CTA, and footer from `/admin/public-site`.
  Settings are persisted in PostgreSQL; JPG/PNG/WebP assets are validated and
  stored in Cloudflare R2 when configured, with `/uploads/site/*` as the local
  development fallback. Every publish creates an immutable version;
  admins can review the editor/timestamp history and safely restore any prior
  design without deleting newer history.
- **Realtime public-site delivery**: a Socket.IO gateway in `realtime/`
  subscribes to trusted Go API updates through Redis Pub/Sub. Publishing or
  restoring public-site settings immediately refreshes connected public pages;
  reconnecting browsers fetch the authoritative current version so missed
  Pub/Sub messages cannot leave the UI stale. The gateway is outbound-only,
  origin-restricted, and runs on port `8081` in Compose.
- **Admin operations**: exact database-backed metrics, registration roster/CSV,
  event/category/schedule management, audit trail, real super-admin user-role
  management, and camera/USB/manual race check-in.

Full per-phase detail, design rationale, and what was explicitly deferred is in each phase's commit message (`git log --oneline` on this branch) — they're intentionally short now per your preference, but earlier ones (Phases 1–5) are more verbose and worth reading if you want the "why" behind a specific decision.

## What's NOT built yet

- **Bakong production credentials** — the KHQR/Open API integration is built, but a real merchant account ID, acquiring-bank values, API base URL, and bearer token still need to be supplied and certified in Bakong's test environment before production.
- **CI/CD** (GitHub Actions) — not set up.
- **Production deployment** — no Dockerfile hardening pass, no Vercel/container-platform config yet.
- Known gap flagged during Phase 5: `check_ins.staff_user_id` has no `ON DELETE` behavior, so a staff account that's ever performed a check-in can't be hard-deleted. Worth a soft-delete approach whenever user management gets built out.

## Phase 7: Next.js Frontend & Admin Panel (stabilization in progress)

Frontend built with Next.js, TypeScript, and Tailwind CSS. Key pages implemented:

- **Public & Participant Pages**:
  - **Auth**: Login (`/auth/login`) and Register (`/auth/register`) with API integration
  - **Events**: Events listing (`/events`) with status badges and registration CTA
  - **Event Register**: Dynamic event registration (`/events/[slug]`) per event
  - **Dashboard**: User dashboard (`/dashboard`) showing registrations, profile, and organizer shortcut

- **Admin Panel (`/admin`)**:
  - **Dashboard Overview (`/admin`)**: Metrics (total events, active registrations, ticket revenue, check-in count), quick actions, active events breakdown, and recent registrations.
  - **Check-in Station (`/admin/checkin`)**: Race-day QR scanner with live camera feed (`html5-qrcode`), continuous USB barcode / text search input, Web Audio API sound synthesis (success chime, already-checked-in warning, error tone), and real-time live check-in tally.
  - **Events Management (`/admin/events`)**: Events table with status filters (`Draft`, `Open & Live`, `Published`, `Closed/Done`), draft deletion, create wizard (`/admin/events/new`), and editor (`/admin/events/[id]/edit`) with poster upload/preview controls and status transitions (`DRAFT → PUBLISHED → REGISTRATION_OPEN → REGISTRATION_CLOSED → COMPLETED → ARCHIVED` / `CANCELLED`). Uploaded JPG/PNG/WebP artwork uses Cloudflare R2 in configured environments, with local `/uploads/events/*` storage retained for development.
  - **Registrations & Attendee Roster (`/admin/registrations`)**: Multi-parameter search & filtering (by event, category, status), participant detail drawer with contact info & emergency snapshot, and one-click CSV export for timing chips/bib assignment.
  - **User & Staff RBAC Management (`/admin/users`)**: API-backed Super Admin directory with audited role assignment (`USER`, `STAFF`, `ADMIN`, `SUPER_ADMIN`) and self-demotion protection.
  - **System Console (`/admin/system`)**: read-only Super Admin diagnostics for the API runtime, PostgreSQL pool/size/schema, Redis memory and queues, Cloudflare R2 connectivity, Socket.IO, SMTP, Google OAuth, payments, security posture, notification workers, and backup readiness. The API response is deliberately sanitized: secrets are represented only as configured/missing and are never returned to the browser.
  - **System Audit Trail (`/admin/audit-logs`)**: Activity log table tracking sensitive actions, state changes, actor IDs, and timestamps.
  - **Public Site (`/admin/public-site`)**: Live-preview editor for identity, logo, color system, announcement banner, homepage story, CTA/footer, and a one-to-six-image hero carousel with uploads and ordering controls. Includes an immutable version ledger and additive restore workflow.
  - **Role-Guarded Navigation (`AdminLayout`)**: Sidebar and header navigation with dynamic role permission gating and user profile menu.

## How to run it locally

```bash
cd /Users/dara/development/Unity-RUNN
cp .env.example .env
docker compose up -d --build   # postgres, redis, api, Socket.IO gateway
make migrate                    # applies all 22 migrations
make seed                       # one example event, always registration-open (dates relative to now)

cd frontend
npm install
npm run dev                     # Next.js at http://localhost:3000
```

- API: http://localhost:8080
- Socket.IO / realtime health: http://localhost:8081/health
- Super Admin system console: http://localhost:3000/admin/system
- `make test` — unit tests only, no DB needed
- `make test-integration` — needs the compose stack up (`-p 1`, packages run serially — several integration tests truncate shared tables)
- `make lint` — `go vet` + `gofmt -l`

### DBeaver (or any Postgres client) connection

Local dev credentials only — from `.env.example`'s `POSTGRES_*` defaults, not secret:

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `unity_run_club` |
| Username | `unity` |
| Password | `unity` |

Redis (if you want to inspect the `notifications:queue` list or registration locks): `localhost:6379`, no password, DB `0`.

## Picking this back up

1. Read this file, inspect `git status`, and skim `git log --oneline -10`.
2. Finish Phase 7 stabilization: run migrations 18–22 and exercise login refresh,
   registration, stable QR display/download, correct-event check-in, duplicate
   check-in, cancellation-after-check-in rejection, metrics, and role changes
   against a live Docker stack.
3. Clear the remaining frontend lint warnings incrementally; lint and the
   production build currently complete successfully.
4. Configure the `BAKONG_*` values, switch `PAYMENT_PROVIDER=bakong`, and run
   an end-to-end payment in Bakong's test environment before production.
5. The remaining major roadmap choices are CI/CD, a production R2 custom media domain, and
   production deployment.
6. Keep commits short and plain; never add a `Co-Authored-By: Claude` trailer.
