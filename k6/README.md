# Load testing

Four k6 scenarios exercise the claims in [`docs/scaling.md`](../docs/scaling.md):
never oversell a category, never double-book a user, never double-confirm a
payment, and a sense of where this stack actually breaks under load.

## Prerequisites

```sh
# Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

# Bring up the full stack (Traefik + 2 API replicas + worker + PgBouncer + Postgres + Redis)
docker compose up -d --build
make migrate

# Seed test users + a free-category event for scenarios A, B, D
DATABASE_URL=postgres://unity:unity@localhost:5432/unity_run_club?sslmode=disable \
JWT_SECRET=<same secret the running api containers use> \
go run ./backend/cmd/loadtestseed -users=2000 -capacity=1000 \
  -users-out=k6/users.json -event-out=k6/event.json

# Add -paid -paid-count=50 to the same command if you also want to run scenario C
```

`JWT_SECRET` must match whatever the API containers are actually running with
(check `.env` locally, or the Dokploy environment for staging) — the tool
mints JWTs directly rather than going through `/auth/login`, so a mismatched
secret produces tokens the API will reject as invalid.

**Raise the events-read rate limit before running scenario A or D.** k6
traffic comes from one (or a handful of) machine IPs, but
`RATE_LIMIT_EVENTS_READ_MAX` (default 100/min) is a *per-IP* limit meant to
stop one abusive client — real users each have their own IP, a k6 load
generator does not. Left at the default, scenario A/D will mostly see 429s
almost immediately, which is the rate limiter doing exactly its job, not a
bug. Add to the target stack's `.env` before load testing (and remove
afterward):

```sh
echo "RATE_LIMIT_EVENTS_READ_MAX=100000" >> .env
docker compose up -d api api-replica
```

Scenario B and C are unaffected — they're keyed by authenticated user, and
each seeded user only makes one or a few calls.

**Bump the gateway's resource limits before running scenario B or D at real
scale (thousands of VUs).** The local Traefik gateway defaults to
`GATEWAY_MEMORY_LIMIT=128m`/`GATEWAY_CPU_LIMIT=0.25`, sized for normal local
dev traffic, not a genuine 2,000+ simultaneous-connection burst. At the
default, the gateway container itself restarted mid-run under real load
(confirmed via `RestartCount`), resetting every in-flight connection and
producing a wave of client-side "connection reset by peer" errors that have
nothing to do with the application (the API logged zero 500s throughout, and
the database stayed exactly correct). Bump it first:

```sh
echo "GATEWAY_MEMORY_LIMIT=512m" >> .env
echo "GATEWAY_CPU_LIMIT=2.0" >> .env
docker compose up -d api-gateway
```

Check `docker inspect <gateway-container> --format '{{.RestartCount}}'`
before and after a run — if it climbs, raise the limits further before
trusting the run's connection-level metrics (the database check is still
authoritative regardless, but a crashing gateway makes k6's own numbers
meaningless).

## What scenario B's retry loop is for (and what it found)

The registration endpoint sits behind a non-blocking, single-holder-at-a-time
Redis lock per category (`internal/registrations/lock.go`) — a caller that
doesn't win it gets an immediate `429 busy`, not a queued wait. That's a
correctness-preserving throughput throttle, not a bug, but it means a client
that only tries once will mostly see 429s during a genuine simultaneous burst.
Scenario B retries on 429 (same `Idempotency-Key` each time, so a retry safely
replays rather than risking a second write) to model what a real client is
expected to do.

Running this repeatedly at 2,000-vs-1,000 scale on this laptop's Docker stack
surfaced a real, thoroughly-investigated characteristic: lock throughput
under sustained heavy contention lands well under capacity within the retry
budget (anywhere from ~13 to ~687 filled seats across different runs,
depending on other factors like whether the gateway was crashing — see the
gateway note above) — **and in every single run, zero overselling occurred**,
confirmed against the database every time. Jitter, faster retries, and more
API CPU were each tried and none meaningfully changed the throughput
ceiling — see "Expected bottlenecks" in
[`docs/scaling.md`](../docs/scaling.md) for the full investigation.

If your run shows many `registration_busy_retries_exhausted` and a
DB-verified count well under capacity, that's this same characteristic, not a
new bug. The database count being `<= capacity` is the only thing that
matters for correctness; treat the exact fill number as a throughput data
point for this hardware, not a target to hit.

## Running each scenario

```sh
k6 run k6/scenario_a_browsing.js                     -e BASE_URL=http://localhost:8080
k6 run k6/scenario_b_registration_burst.js            -e BASE_URL=http://localhost:8080
k6 run k6/scenario_c_payment_verify_duplicates.js     -e BASE_URL=http://localhost:8080
k6 run k6/scenario_d_extreme.js                       -e BASE_URL=http://localhost:8080
```

Each script reads `k6/users.json`/`k6/event.json` relative to itself (`open('./users.json')`),
so run k6 from the repository root as shown above.

## Verifying scenario B (the important one)

k6's own `registration_success`/`registration_capacity_full` counters in the
end-of-run summary are a live sanity check only — a client-side timeout can
make a request look failed even when the write actually committed server-side.
The authoritative check is the database, run immediately after the k6 run:

```sh
DATABASE_URL=postgres://unity:unity@localhost:5432/unity_run_club?sslmode=disable \
go run ./backend/cmd/loadtestseed -verify -category-id=<category_id from k6/event.json> -expect=1000
```

This must print `PASS` with the count exactly equal to `min(seeded users, capacity)` —
never one over.

## Verifying "one payment never produces two tickets"

Scenario C hits the real HTTP payment-verify endpoint, but the bundled mock
payment provider can't actually settle a payment through it (see the comment
at the top of `scenario_c_payment_verify_duplicates.js` for why) — so it's
useful for exercising the endpoint's error handling and rate limit under
concurrent duplicate calls, but it isn't the proof of the ticket-uniqueness
guarantee. That proof is a direct Go concurrency test against a real
Postgres connection:

```sh
DATABASE_URL=postgres://unity:unity@localhost:5432/unity_run_club?sslmode=disable \
go test ./backend/internal/registrations/... \
  -run TestRepository_ConfirmStoredPayment_ConcurrentCallsConfirmExactlyOnce -v
```

## An honest caveat about scenario D

Local `docker-compose.yml` intentionally runs a small, laptop-friendly stack:
`GOMAXPROCS=1` per API container, PostgreSQL with `shared_buffers=64MB` and
`max_connections=50`. That's correct for local dev, but it means scenario D's
5,000-VU run will very likely bottleneck on CPU/DB long before genuinely
proving out 5,000 concurrent users — you'll see rising latency and error
rates that reflect your laptop, not the target production topology.

Treat a local scenario D run as a smoke/regression report ("did this get much
worse than the last time I ran it"), not a pass/fail SLA gate. To validate
real 5,000-concurrent-user capacity, run it against a box provisioned like
`docker-compose.dokploy.yml`'s resource limits (or higher), ideally as its own
staging environment separate from anything real users touch.

## Files

| File | Purpose |
|---|---|
| `users.json` | `{user_id, token}` pairs, generated by `loadtestseed`. Gitignored — regenerate per run. |
| `event.json` | Seeded event/category ids and (with `-paid`) pending paid registration ids. Gitignored. |
| `scenario_a_browsing.js` | 2,000 VUs, public event reads. |
| `scenario_b_registration_burst.js` | The critical oversell test. |
| `scenario_c_payment_verify_duplicates.js` | Duplicate payment-verify calls (endpoint-level, see caveat above). |
| `scenario_d_extreme.js` | 5,000 VUs, mixed read/write, report-only. |
