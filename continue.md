# Unity Run Club — Progress & Continuation Notes

Last updated: 2026-08-23 (end of Phase 6)

## Where things stand

Backend-only so far (`backend/`, Go modular monolith). No frontend has been started yet.

Each phase lives on its own branch, stacked on the previous one — none merged to `main` yet:

```
main
 └─ phase-1-backend-foundation   (Go server skeleton, config, health/ready)
     └─ phase-2-events-domain     (events, categories, schedule, FAQs, rules)
         └─ phase-3-auth-jwt-rbac     (users/profiles, JWT, RBAC — replaced the admin-key stopgap)
             └─ phase-4-registrations-redis  (capacity-safe registration, Redis locks/cache/rate-limit, mock payments)
                 └─ phase-5-checkin              (QR check-in, admin registration views, audit log)
                     └─ phase-6-email-notifications  (async email pipeline, all 5 templates) ← current branch
```

Current branch: `phase-6-email-notifications`. Every phase has been verified end-to-end against a live `docker compose` stack (not just unit tests) before committing, and `make test-integration` (real Postgres + Redis) passes on all of them.

## What's built

- **Foundation**: Chi router, structured JSON logging, pgx/Redis connections, graceful shutdown, `/health` + `/ready`.
- **Events**: full CRUD, status lifecycle (`DRAFT → PUBLISHED → REGISTRATION_OPEN → REGISTRATION_CLOSED → COMPLETED`, plus `CANCELLED`/`ARCHIVED`), categories/schedule/FAQs/rules.
- **Auth**: register/login/refresh/logout, JWT access token + rotating refresh-token cookie, `USER < STAFF < ADMIN < SUPER_ADMIN` RBAC.
- **Registrations**: `SELECT ... FOR UPDATE`-based capacity safety (proven under real concurrency), one-active-registration-per-user-per-event, Redis lock/availability-cache/rate-limit, mock payment provider, QR ticket tokens.
- **Check-in**: QR token verification, one-check-in-per-registration (DB-enforced), admin registration listing, audit log.
- **Notifications**: all 5 email types (registration confirmation, payment confirmation, cancellation, event update, event reminder), async via a Redis-queued/Postgres-swept worker, SMTP optional (logs instead of sending when unconfigured).

Full per-phase detail, design rationale, and what was explicitly deferred is in each phase's commit message (`git log --oneline` on this branch) — they're intentionally short now per your preference, but earlier ones (Phases 1–5) are more verbose and worth reading if you want the "why" behind a specific decision.

## What's NOT built yet

- **Real payment provider** — `internal/payments.MockProvider` auto-succeeds; a real Cambodian gateway is a dedicated later phase per the original plan, behind the existing `Provider` interface.
- **Cloudflare R2** (image/asset storage) — env vars are placeholder-commented in `.env.example`, nothing wired.
- **CI/CD** (GitHub Actions) — not set up.
- **Production deployment** — no Dockerfile hardening pass, no Vercel/container-platform config yet.
- Known gap flagged during Phase 5: `check_ins.staff_user_id` has no `ON DELETE` behavior, so a staff account that's ever performed a check-in can't be hard-deleted. Worth a soft-delete approach whenever user management gets built out.

## Phase 7: Next.js Frontend & Admin Panel (in progress)

Frontend built with Next.js, TypeScript, and Tailwind CSS. Key pages implemented:

- **Public & Participant Pages**:
  - **Auth**: Login (`/auth/login`) and Register (`/auth/register`) with API integration
  - **Events**: Events listing (`/events`) with status badges and registration CTA
  - **Event Register**: Dynamic event registration (`/events/[slug]`) per event
  - **Dashboard**: User dashboard (`/dashboard`) showing registrations, profile, and organizer shortcut

- **Admin Panel (`/admin`)**:
  - **Dashboard Overview (`/admin`)**: Metrics (total events, active registrations, ticket revenue, check-in count), quick actions, active events breakdown, and recent registrations.
  - **Check-in Station (`/admin/checkin`)**: Race-day QR scanner with live camera feed (`html5-qrcode`), continuous USB barcode / text search input, Web Audio API sound synthesis (success chime, already-checked-in warning, error tone), and real-time live check-in tally.
  - **Events Management (`/admin/events`)**: Events table with status filters (`Draft`, `Open & Live`, `Published`, `Closed/Done`), draft deletion, create wizard (`/admin/events/new`), and editor (`/admin/events/[id]/edit`) with status transition controls (`DRAFT → PUBLISHED → REGISTRATION_OPEN → REGISTRATION_CLOSED → COMPLETED → ARCHIVED` / `CANCELLED`).
  - **Registrations & Attendee Roster (`/admin/registrations`)**: Multi-parameter search & filtering (by event, category, status), participant detail drawer with contact info & emergency snapshot, and one-click CSV export for timing chips/bib assignment.
  - **User & Staff RBAC Management (`/admin/users`)**: Super Admin directory with role assignment dropdown (`USER`, `STAFF`, `ADMIN`, `SUPER_ADMIN`).
  - **System Audit Trail (`/admin/audit-logs`)**: Activity log table tracking sensitive actions, state changes, actor IDs, and timestamps.
  - **Role-Guarded Navigation (`AdminLayout`)**: Sidebar and header navigation with dynamic role permission gating and user profile menu.

## How to run it locally

```bash
cd /Users/dara/development/Unity-RUNN
cp .env.example .env
docker compose up -d --build   # postgres, redis, api
make migrate                    # applies all 17 migrations
make seed                       # one example event, always registration-open (dates relative to now)
```

- API: http://localhost:8080
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

1. Read this file, then skim the last few commit messages (`git log --oneline -10` on `phase-6-email-notifications`) for the freshest context.
2. Decide: continue the backend roadmap (real payment provider, CI/CD) or start the Next.js frontend — both are reasonable next steps, ask the user which.
3. Follow the same per-phase workflow used so far: plan mode → `AskUserQuestion` for open design decisions → implement → unit tests → integration tests → full docker-compose end-to-end verification → commit on a new branch stacked on the current one. Don't merge branches together unless asked.
4. Standing preferences (saved in this session's memory, should persist): never add a `Co-Authored-By: Claude` trailer to commits; keep commit messages short and plain, not long structured essays.
