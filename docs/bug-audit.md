# Bug audit — 15 September 2026

The audit is ongoing. Passing tests cover the cases below; they do not establish that the repository has no remaining bugs.

## Fixed and checked

| Area | Change | Evidence |
| --- | --- | --- |
| Mobile Events | Consistent space between month headings and cards; wrapping filters and location metadata | Loaded iPhone 17 Pro simulator render, `/tmp/unity-bug-audit-launched.png` |
| Dynamic Island | Padding/background applied to stack containers; event details below the sensor; bounded badges and timers | iOS export and TypeScript pass; expanded native render remains pending |
| Web Events | Shared filter URLs survive hydration and reload; clearing filters updates all values together | Desktop and mobile browser regression tests, including sequential search typing |
| Live Activity creation | A rejected backend follow dismisses the newly created native activity | Tests cover duplicate follow and cleanup failure |
| Live Activity tokens | Listener/getter failures are bounded; synchronous tokens and listener cleanup are handled | Token regression tests |
| Live Activity content | Start includes progress; updates keep a stable elapsed-time anchor; complete content is saved in SecureStore for app restarts | Content serialization/patch tests and iOS export; real native restart still pending |
| Live Activity cleanup | Cleanup uses device IDs captured before the server request and skips snapshots overlapping a follow | Tests cover an in-flight follow, a completed concurrent follow, and a real orphan |
| Live Activity dismissal | Explicit unfollow requests immediate dismissal; failed native dismissal retains retry state | TypeScript/iOS export; native behavior needs device verification |
| Realtime | Public registration notifications omit private identifiers; Redis fan-out uses local socket broadcasts; reconnect invalidates stale client caches | Realtime tests and mobile invalidation tests |
| Browser test dates | Automation scheduling tests use a fixed clock so their future dates do not become past dates | Full browser suite passes |

## Validation

- Mobile: `npm run typecheck` and `npm test` — 40 tests passed.
- iOS: `npx expo export --platform ios --output-dir /tmp/unity-bug-audit-ios-export` passed after the native content/token changes. The subsequent cleanup changes passed TypeScript and regression tests.
- Frontend: lint, TypeScript, and production build passed. One existing `EventPosterField` raw-image lint warning remains.
- Browser: 68 tests passed across desktop and mobile Chromium configurations. The run used installed Brave through `tmp/bug-audit.playwright.config.ts`, because the pinned Playwright browser was unavailable. These are browser viewport tests, not native iPhone tests.
- Backend: unit tests with the race detector and `go vet ./...` passed.
- Backend integration: all packages passed with `-tags=integration -race -count=1 -p 1`, using a fresh database with all 34 migrations and isolated Redis. The integration suite truncates tables; do not run it against the normal development database.
- Realtime: syntax checks and 3 tests passed.

Detailed local logs are in `/tmp/unity-bug-audit-brave.log`, `/tmp/unity-bug-audit-integration.log`, `/tmp/unity-bug-audit-web-build.log`, and `/tmp/unity-bug-audit-ios-export.log`. These temporary files are not committed artifacts.

## Remaining work

1. Verify expanded/compact Dynamic Island and Lock Screen layouts on smaller and larger supported iPhones, including long event names. Native UI automation timed out during this session; the successful Events render does not validate the Island.
2. Exercise native app restart, token timeout, and immediate dismissal on a device. The content-state and token tests run outside ActivityKit and do not validate SecureStore or the widget extension itself.
3. Activities started before content persistence was added have no saved content. A partial update now fails safely instead of sending incomplete props; users can stop and refollow those activities.
4. Audit status synchronization between backend records and native activities. `restore()` currently fetches records and reconciles orphans; it does not apply updated server statuses to native content. The backend APNs publisher is still a no-op.
5. Audit expiry and refollow behavior after iOS ends an activity, concurrent native updates, and cleanup of saved content after system-initiated termination.
6. Complete the remaining API authorization and lifecycle review. Current test coverage is not an exhaustive security or correctness review.
