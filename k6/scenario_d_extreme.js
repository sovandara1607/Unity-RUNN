// Scenario D — extreme load, 5,000 concurrent users, mixed read/write.
//
// Report-only: no pass/fail thresholds. The goal is to establish where this
// stack actually breaks and by how much, not to assert a specific SLA. See
// k6/README.md for an honest caveat about what a laptop-hosted docker-compose
// stack can sustain versus a real staging box.
//
// Run:
//   k6 run k6/scenario_d_extreme.js -e BASE_URL=http://localhost:8080
//   k6 run k6/scenario_d_extreme.js -e BASE_URL=http://localhost:8080 --out json=k6/scenario_d_report.json
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const users = new SharedArray('users', function () {
  return JSON.parse(open('./users.json'));
});
const event = JSON.parse(open('./event.json'));

export const options = {
  scenarios: {
    // The bulk of traffic: public event reads ramping to 5,000 VUs.
    reads: {
      executor: 'ramping-vus',
      exec: 'read',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 2500 },
        { duration: '30s', target: 5000 },
        { duration: '30s', target: 5000 },
        { duration: '20s', target: 0 },
      ],
    },
    // A smaller, authenticated concurrent slice hammering the availability
    // endpoint (Redis-cached, falls through to a real COUNT(*) on a miss) —
    // a real registration POST can't be repeated per seeded user (one active
    // registration per user per event), so this is the closest sustained
    // write-adjacent hot-path load: same cache/DB path a registration read
    // exercises, without exhausting the one-shot capacity resource.
    writes: {
      executor: 'ramping-vus',
      exec: 'write',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 250 },
        { duration: '30s', target: 500 },
        { duration: '30s', target: 500 },
        { duration: '20s', target: 0 },
      ],
    },
  },
  // Deliberately no `thresholds` block — see file header.
};

export function read() {
  // GET /events/{id} is a slug lookup, not a UUID lookup.
  const res = http.get(`${BASE_URL}/api/v1/events/${event.slug}`);
  check(res, { 'read: no server error': (r) => r.status < 500 });
  sleep(1);
}

export function write() {
  const u = users[Math.floor(Math.random() * users.length)];
  const res = http.get(
    `${BASE_URL}/api/v1/events/${event.event_id}/categories/${event.category_id}/availability`,
    { headers: { Authorization: `Bearer ${u.token}` } }
  );
  check(res, { 'write: no server error': (r) => r.status < 500 });
  sleep(1);
}
