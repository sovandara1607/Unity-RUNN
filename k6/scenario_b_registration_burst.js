// Scenario B — registration-opening burst. THE critical test.
//
// Simulates VUS distinct, pre-provisioned users all attempting to register
// for the same event category the instant registration opens, against a
// category whose capacity is smaller than VUS. The claim under test:
// successful reservations must never exceed capacity — not "close to", not
// "eventually consistent", exactly.
//
// Prerequisites:
//   go run ./backend/cmd/loadtestseed -users=2000 -capacity=1000 \
//     -users-out=k6/users.json -event-out=k6/event.json
//
// Run:
//   k6 run k6/scenario_b_registration_burst.js -e BASE_URL=http://localhost:8080
//
// k6's own registration_success/registration_capacity_full counters below are
// a live sanity check ONLY. They are not the authoritative verification — a
// client-side timeout can make a request look failed even when the server
// committed it. The one trustworthy check is the database count, run
// immediately after this scenario finishes:
//
//   go run ./backend/cmd/loadtestseed -verify -category-id=<category_id> -expect=<min(VUS,capacity)>
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const users = new SharedArray('users', function () {
  return JSON.parse(open('./users.json'));
});
const event = JSON.parse(open('./event.json'));

const registrationSuccess = new Counter('registration_success');
const registrationCapacityFull = new Counter('registration_capacity_full');
const registrationBusyExhausted = new Counter('registration_busy_retries_exhausted');
const registrationOther = new Counter('registration_other');

// The category has a Redis lock (see internal/registrations/lock.go) that
// serializes writes against ONE category to a single holder at a time as a
// fast pre-filter before the DB transaction — it's a throughput throttle, not
// a queue: a caller that doesn't win the lock gets an immediate 429 "busy",
// not a wait. A real client is expected to
// retry a few times with backoff, exactly like it would retry any other
// transient contention — this loop is that retry, not a workaround for a
// bug. Without it, this scenario would just measure "how many of 2000
// simultaneous requests won a non-blocking lock's first race," which is a
// much narrower (and less interesting) question than "how many distinct
// users eventually get a seat."
const MAX_RETRIES = 20;
const RETRY_DELAY_SECONDS = 0.3;
// Jitter so 2000 VUs don't all retry in perfect lockstep. Tried a range of
// delay/jitter values against this exact scenario (0.3s/0.3s, 0.05s/0.05s,
// with and without jitter) — none of them meaningfully changed the number of
// successful registrations under sustained 2000-VU contention on this local
// stack. See "Expected bottlenecks" in docs/scaling.md for the full story;
// this is set to a realistic client-retry pace, not tuned to hit a number.
const RETRY_JITTER_SECONDS = 0.3;

export const options = {
  scenarios: {
    // per-vu-iterations (not ramping-vus): the point is the actual
    // instantaneous burst — every VU fires as close to "now" as k6 can
    // schedule it, each doing exactly one registration attempt with its own
    // pre-provisioned user, never reused. ramping-vus would deliberately
    // smooth the arrival curve, which is the opposite of what's being tested.
    burst: {
      executor: 'per-vu-iterations',
      vus: users.length,
      iterations: 1,
      // Generous: the non-blocking category lock means most of the VUS/CAPACITY
      // gap has to resolve via client-side retries (see the comment above), not
      // a single instant wave. Raise further on a slower host if VUs still get
      // cut off mid-retry (k6's summary will show "interrupted" iterations).
      maxDuration: '3m',
    },
  },
  // No hard thresholds here — capacity_full responses are an EXPECTED,
  // correct outcome for most VUs, not a failure. Correctness is judged by
  // the loadtestseed -verify step, not by k6's pass/fail gate.
};

export default function () {
  const u = users[__VU - 1];
  const idemKey = `k6-burst-${__VU}-${__ITER}`;
  const body = JSON.stringify({
    event_category_id: event.category_id,
    full_name: `Load Test VU ${__VU}`,
    email: `loadtest-vu-${__VU}@unityrunclub.loadtest`,
    phone: '0120000000',
    date_of_birth: '1990-01-01',
    gender: 'other',
    emergency_contact_name: 'Emergency Contact',
    emergency_contact_phone: '0980000000',
    tshirt_size: 'M',
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${u.token}`,
    // Same key across retries: a retried attempt replays the original
    // outcome instead of racing a second write for the same user.
    'Idempotency-Key': idemKey,
  };

  let res;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    res = http.post(`${BASE_URL}/api/v1/events/${event.event_id}/registrations`, body, { headers });
    if (res.status !== 429) {
      break;
    }
    if (attempt === MAX_RETRIES) {
      registrationBusyExhausted.add(1);
    }
    sleep(RETRY_DELAY_SECONDS + Math.random() * RETRY_JITTER_SECONDS);
  }

  if (res.status === 201) {
    registrationSuccess.add(1);
  } else if (res.status === 409) {
    registrationCapacityFull.add(1);
  } else if (res.status !== 429) {
    registrationOther.add(1);
  }
  check(res, { 'status is 201, 409, or exhausted-retry 429': (r) => r.status === 201 || r.status === 409 || r.status === 429 });
}
