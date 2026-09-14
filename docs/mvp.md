# MVP definition

Scope decision: the MVP covers the whole platform (web, backend, mobile), sized for one club (Unity Runn Club) running one event live at a time, with roughly tens to a few hundred runners per event. Multi-club/multi-organizer support is explicitly out of scope for MVP.

"Done" for MVP means: an organizer can publish one real event, a runner can find it, register, pay, and receive a ticket, and staff can check runners in on race day — without anyone touching the database by hand.

Most of this is already built (see [progress.md](../progress.md)). The value of this document is drawing the line around what's required for the *first real event* versus what can wait.

## In scope — required for launch

Already built; keep as-is:

- **Auth**: register/login, Google sign-in (web + mobile), JWT + refresh cookie
- **One event at a time**: full lifecycle (`DRAFT → PUBLISHED → REGISTRATION_OPEN → REGISTRATION_CLOSED → COMPLETED`), categories, price, capacity, schedule, FAQs
- **Registration**: capacity enforcement, one active registration per user/event, cancellation
- **Payment**: Bakong KHQR checkout with server-side verification (mock provider only good for dev, see blockers below)
- **Tickets**: QR ticket token, ticket wallet, downloadable ticket card
- **Notifications**: registration confirmation, payment confirmation, cancellation, event reminder (Gmail SMTP)
- **Check-in**: QR/camera/manual check-in station, duplicate-check-in prevention
- **Admin**: event editor, registration roster + CSV export, check-in station, basic ops dashboard
- **Mobile**: browse/view event, register, pay, view ticket/QR wallet, basic account screen

## Deferred — built, but not required for v1 launch

Leave in place (no cost to keep), but don't spend more effort polishing before launch:

- Public-site design editor + version history (hardcode the initial branding instead of using the live editor)
- Audit log, SUPER_ADMIN system console — useful internally, not user-facing MVP
- Multiple concurrent events / heavier event-calendar admin UX
- Mobile profile editing beyond the basics

## Non-negotiable before taking real money

These aren't product features, they're launch blockers because real payments and real user data are involved:

1. **Production Bakong credentials** — merchant account, acquiring-bank values, bearer token, and one certified test-environment transaction. Mock provider must not be live in production.
2. **Automated backups** for PostgreSQL and R2, with at least one restore drill. Not configured today.
3. **Production hosting finalized** — HTTPS, reverse proxy, environment secrets (Dokploy config exists but isn't confirmed live).
4. **Minimal failure alerting** — even just an email/Slack ping on 5xx spikes or a stalled notification worker. Full observability can wait; silent failure during a live event can't.

## Explicit non-goals for MVP

- Multi-club / multi-organizer tenancy
- Concurrent multi-event operations at scale
- Public API for third-party integrations
- `check_ins.staff_user_id` soft-delete handling (known gap, low urgency at this scale)

## Target scale to design/test against

- One event live at a time
- Capacity: low hundreds of runners
- One organizing team (ADMIN/STAFF roles), not multiple independent clubs
- One payment provider (Bakong)
