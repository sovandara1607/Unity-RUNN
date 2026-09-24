# MVP definition

Last audited against `main`: 20 September 2026

Checklist convention: `[x]` means the implementation is present in this
repository. It does not mean the production environment or a physical device
has been verified. `[ ]` means missing or not yet proven.

Scope decision: the MVP covers the whole platform (web, backend, mobile), sized for one club (Unity Runn Club) running one event live at a time, with roughly tens to a few hundred runners per event. Multi-club/multi-organizer support is explicitly out of scope for MVP.

"Done" for MVP means: an organizer can publish one real event, a runner can find it, register, pay, and receive a ticket, and staff can check runners in on race day — without anyone touching the database by hand.

Most of this is already built (see [progress.md](../progress.md)). The value of this document is drawing the line around what's required for the *first real event* versus what can wait.

## In scope — required for launch

Already built; keep as-is:

- [x] **Auth**: register/login, Google sign-in (web + mobile), JWT + refresh cookie
- [x] **One event at a time**: full lifecycle (`DRAFT → PUBLISHED → REGISTRATION_OPEN → REGISTRATION_CLOSED → COMPLETED`), categories, price, capacity, schedule, FAQs
- [x] **Registration**: capacity enforcement, one active registration per user/event, cancellation
- [x] **Payment**: bank-agnostic QR checkout, runner-submitted transaction reference, and admin approval/rejection states (mock provider remains for development)
- [x] **Tickets**: QR ticket token, ticket wallet, downloadable ticket card
- [x] **Notifications**: registration confirmation, payment confirmation, cancellation, event reminder (Gmail SMTP)
- [x] **Check-in**: QR/camera/manual check-in station, duplicate-check-in prevention
- [x] **Admin**: event editor, registration roster + CSV export, check-in station, basic ops dashboard
- [x] **Mobile**: browse/view event, register, pay, view ticket/QR wallet, basic account screen

## Deferred — built, but not required for v1 launch

Leave in place (no cost to keep), but don't spend more effort polishing before launch:

- Public-site design editor + version history (hardcode the initial branding instead of using the live editor)
- Audit log, SUPER_ADMIN system console — useful internally, not user-facing MVP
- Multiple concurrent events / heavier event-calendar admin UX
- Mobile profile editing beyond the basics

## Launch checklist

### P0 — block taking real money

- [x] **Implement manual bank-QR review**: a runner can scan with any compatible
  banking app, submit the bank transaction reference, wait in `PROCESSING`, and
  receive a confirmed ticket or failed-payment state after admin review.
- [ ] **Configure the real bank QR**: set `PAYMENT_PROVIDER=manual` and
  `MANUAL_PAYMENT_QR_STRING` to the decoded payload of the club's receiving QR.
  The real QR payload is a deployment secret and is not committed here.
- [ ] **Run and document one real payment review**: pay the exact amount from a
  second bank, verify the submitted reference against the receiving account,
  approve it in the admin roster, and prove the runner receives a usable ticket.
  Repeat once with rejection to prove the failed-payment message.
- [ ] **Define payment-review operations**: name the admins allowed to access the
  receiving bank statement, set a review-time expectation, and document how to
  resolve duplicate, mistyped, or wrong-amount references. A static QR does not
  provide automatic settlement confirmation.
- [ ] **Make cancellation and check-in state changes atomic**: both flows read
  registration state before the final write, allowing cancellation and check-in
  to cross under concurrency. Lock or condition the registration row in the same
  transaction as the state change, and add concurrent integration tests.
  Evidence: `registrations.Service.Cancel`, `registrations.Repository.Cancel`,
  and `checkin.Service.CheckIn`/`checkin.Repository.Create`.
- [ ] **Configure automated PostgreSQL and R2 backups**, then record at least
  one successful restore drill. `deploy/dokploy.md` describes the desired setup,
  but the repository contains no backup job or restore receipt.
- [ ] **Create and verify the production environment**: separate database and
  secrets, HTTPS domains, R2, SMTP, Google OAuth callbacks, Telegram webhook,
  migrations, `/ready`, realtime health, and a complete
  register→pay→ticket→check-in smoke test. The current automated deployment
  target is the client preview, not production.
- [ ] **Verify transactional delivery to a real mailbox**: prove registration,
  payment, cancellation, and reminder emails arrive with their expected
  attachments. SMTP acceptance alone is not proof of inbox delivery.
- [ ] **Add external failure alerts** for API 5xx spikes, readiness failure,
  payment-reconciliation errors, notification-worker heartbeat failure, queue
  failures, and backup failure.

### P1 — required launch confidence

- [ ] **Put all maintained test suites in CI**. `.github/workflows/ci.yml`
  currently omits mobile typecheck/tests, frontend Playwright journeys, and the
  realtime test suite even though those commands exist.
- [ ] **Run the MVP path on physical iOS and Android devices** against the
  production-shaped environment, including session restore, Google sign-in,
  bank-QR scan/reference submission, admin approval/rejection, ticket rendering,
  camera permissions, and an actual
  server check-in. Browser mobile viewports and Expo export are not device proof.
- [ ] **Require an expiry claim on access JWTs**. Issued tokens include `exp`,
  but `ParseAccessToken` does not currently use `jwt.WithExpirationRequired()`.
- [ ] **Make refresh-token rotation atomic** so consuming the old token and
  creating the replacement cannot leave a valid user signed out after a partial
  database failure. Add a concurrent refresh integration test.
- [ ] **Protect `main` with required CI checks** and require review before
  promotion to `client-preview`. This is a GitHub setting and cannot be proven
  from the repository alone.
- [ ] **Reconcile stale handoff documents**. `progress.md` and `continue.md`
  still describe the old Phase 7 branch, migration 26, and pre-replica Compose
  topology; current `main` contains migrations through 38 and the Dokploy
  client-preview pipeline.

### Conditional — only if marketed for the first event

- [ ] **Finish remote iOS Live Activity delivery**. The backend publisher is an
  intentional no-op, so server-side race changes do not reach ActivityKit until
  the app reopens and restores. Wire APNs and complete the native-device checks
  tracked in `docs/bug-audit.md`, or leave Live Activities out of the MVP claim.

## Explicit non-goals for MVP

- Multi-club / multi-organizer tenancy
- Concurrent multi-event operations at scale
- Public API for third-party integrations
- `check_ins.staff_user_id` soft-delete handling (known gap, low urgency at this scale)

## Target scale to design/test against

- One event live at a time
- Capacity: low hundreds of runners
- One organizing team (ADMIN/STAFF roles), not multiple independent clubs
- One payment workflow (static bank QR with admin review)

