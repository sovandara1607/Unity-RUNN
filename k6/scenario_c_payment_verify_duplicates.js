// Scenario C — duplicate payment-verify calls.
//
// Intent (per the original spec): prove that N duplicate "payment succeeded"
// deliveries for the same payment never produce more than one ticket. This
// codebase has no inbound payment webhook (Bakong confirmation is poll +
// leased-background-reconciler based, see docs/scaling.md) so this scenario
// adapts the intent to the endpoint that actually exists:
// POST /registrations/{id}/payment/verify, called repeatedly and
// concurrently against the same PENDING paid registration.
//
// IMPORTANT LIMITATION, discovered while building this: the bundled
// `mock` payment provider's GetPaymentStatus always returns Status=SUCCEEDED
// but with Verification=nil, and Service.VerifyPayment requires a non-nil
// Verification before it will confirm anything — so against the mock
// provider, every one of these calls is expected to return 409
// payment_unavailable, never 200. That's a property of the mock provider,
// not a bug in the idempotency guarantee.
//
// The actual "one payment -> one ticket, even under N concurrent confirm
// calls" guarantee is proven directly (with a real Postgres connection, real
// goroutines, no mock-provider gap) by:
//   go test ./backend/internal/registrations/... \
//     -run TestRepository_ConfirmStoredPayment_ConcurrentCallsConfirmExactlyOnce
//
// What THIS scenario is actually good for: confirming the payment-verify
// endpoint stays correct (no 500s, no crashes) and its rate limit
// (RATE_LIMIT_PAYMENT_VERIFY_MAX, default 5/min/user) engages under
// concurrent duplicate calls from the same user — real, useful signal, just
// not the ticket-uniqueness claim itself.
//
// Prerequisites:
//   go run ./backend/cmd/loadtestseed -paid -paid-count=50 \
//     -users-out=k6/users.json -event-out=k6/event.json
//
// Run:
//   k6 run k6/scenario_c_payment_verify_duplicates.js -e BASE_URL=http://localhost:8080
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const CALLS_PER_REGISTRATION = 10;

const users = new SharedArray('users', function () {
  return JSON.parse(open('./users.json'));
});
const event = JSON.parse(open('./event.json'));
const pendingRegistrationIds = event.pending_registration_ids || [];

const verifyOK = new Counter('payment_verify_ok');
const verifyUnavailable = new Counter('payment_verify_unavailable');
const verifyRateLimited = new Counter('payment_verify_rate_limited');
const verifyOther = new Counter('payment_verify_other');

export const options = {
  scenarios: {
    duplicate_verify: {
      executor: 'per-vu-iterations',
      vus: pendingRegistrationIds.length * CALLS_PER_REGISTRATION,
      iterations: 1,
      maxDuration: '30s',
    },
  },
};

export default function () {
  if (pendingRegistrationIds.length === 0) {
    return;
  }
  // Every CALLS_PER_REGISTRATION consecutive VUs hammer the same
  // registration, using the same seeded user that owns it (paid
  // registrations were seeded against the tail of the user pool — see
  // loadtestseed's seedPendingPaidRegistrations).
  const regIndex = Math.floor((__VU - 1) / CALLS_PER_REGISTRATION) % pendingRegistrationIds.length;
  const userIndex = users.length - pendingRegistrationIds.length + regIndex;
  const registrationId = pendingRegistrationIds[regIndex];
  const u = users[userIndex];

  const res = http.post(
    `${BASE_URL}/api/v1/registrations/${registrationId}/payment/verify`,
    null,
    { headers: { Authorization: `Bearer ${u.token}` } }
  );

  if (res.status === 200) {
    verifyOK.add(1);
  } else if (res.status === 409) {
    verifyUnavailable.add(1);
  } else if (res.status === 429) {
    verifyRateLimited.add(1);
  } else {
    verifyOther.add(1);
  }
  check(res, { 'no server error': (r) => r.status < 500 });
}
