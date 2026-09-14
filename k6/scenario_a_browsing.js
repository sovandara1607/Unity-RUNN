// Scenario A — event browsing.
//
// 2,000 concurrent users hitting GET /events/{id} (public, unauthenticated).
// Targets: p95 < 200ms, error rate < 0.1%.
//
// Run:
//   k6 run k6/scenario_a_browsing.js -e BASE_URL=http://localhost:8080 -e EVENT_ID=<slug>
//
// EVENT_ID defaults to reading k6/event.json's event_id (written by
// `go run ./backend/cmd/loadtestseed`), matching scenario B/C/D.
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const eventFile = (() => {
  try {
    return JSON.parse(open('./event.json'));
  } catch (e) {
    return {};
  }
})();
// GET /events/{id} is a SLUG lookup, not a UUID lookup — unlike the
// registration endpoints, which take the real event UUID.
const EVENT_SLUG = __ENV.EVENT_SLUG || eventFile.slug;

export const options = {
  scenarios: {
    browsing: {
      executor: 'constant-vus',
      vus: 2000,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.001'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/events/${EVENT_SLUG}`);
  check(res, { 'status is 200': (r) => r.status === 200 });
}
