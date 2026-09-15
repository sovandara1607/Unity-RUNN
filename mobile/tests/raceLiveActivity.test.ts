import assert from "node:assert/strict";
import { test } from "node:test";
import { raceLiveActivity } from "../services/liveActivity/raceLiveActivity.service";
import { LiveActivityError } from "../services/liveActivity/types";
import { ApiError } from "../services/api/client";
import { nativeBridge } from "../services/liveActivity/nativeBridge";
import type { NativeStartInput } from "../services/liveActivity/nativeBridge.types";
// A minimal fake matching only the `.request` surface raceLiveActivity
// actually calls -- see services/auth/session.ts's real Session class for
// the full shape this stands in for.
function fakeSession(handler: (path: string, options?: any) => Promise<any>) {
  return { request: handler } as any;
}
test("a stale backend snapshot cannot dismiss a concurrently started activity", async (t) => {
  t.mock.method(nativeBridge, "isSupported", async () => true);
  t.mock.method(nativeBridge, "getRunningActivityIds", async () => ["native-1"]);
  t.mock.method(nativeBridge, "start", async () => ({ activityId: "native-1", pushToken: "" }));
  const end = t.mock.method(nativeBridge, "end", async () => {});
  let resolveSnapshot!: (value: unknown) => void;
  const snapshot = new Promise((resolve) => { resolveSnapshot = resolve; });
  let requestStarted!: () => void;
  const requestReady = new Promise<void>((resolve) => { requestStarted = resolve; });
  const fetch = raceLiveActivity.getActive(fakeSession(async () => {
    requestStarted();
    return snapshot;
  }));
  await requestReady;
  await raceLiveActivity.start(fakeSession(async () => ({ activity_id: "native-1" })), {
    eventId: "event-1", eventName: "Test race", location: "Test start", startTime: "2026-10-01T00:00:00Z", status: "live", elapsedSeconds: 90,
  });
  resolveSnapshot({ live_activities: [] });
  await fetch;
  assert.equal(end.mock.callCount(), 0);
});

test("a follow awaiting backend registration is protected from orphan cleanup", async (t) => {
  t.mock.method(nativeBridge, "isSupported", async () => true);
  t.mock.method(nativeBridge, "getRunningActivityIds", async () => ["native-new"]);
  const start = t.mock.method(nativeBridge, "start", async (_input: NativeStartInput) => ({ activityId: "native-new", pushToken: "" }));
  const end = t.mock.method(nativeBridge, "end", async () => {});
  let resolveFollow!: (value: unknown) => void;
  const followRequest = new Promise((resolve) => { resolveFollow = resolve; });
  let requestStarted!: () => void;
  const requestReady = new Promise<void>((resolve) => { requestStarted = resolve; });
  const follow = raceLiveActivity.start(fakeSession(async () => {
    requestStarted();
    return followRequest;
  }), {
    eventId: "event-1", eventName: "Test race", location: "Test start", startTime: "2026-10-01T00:00:00Z", status: "live", elapsedSeconds: 90,
  });
  await requestReady;
  await raceLiveActivity.getActive(fakeSession(async () => ({ live_activities: [] })));
  assert.equal(end.mock.callCount(), 0);
  assert.equal(start.mock.calls[0].arguments[0].elapsedSeconds, 90);
  resolveFollow({ activity_id: "native-new" });
  await follow;
});

test("a stable snapshot dismisses an existing orphan", async (t) => {
  t.mock.method(nativeBridge, "getRunningActivityIds", async () => ["old-orphan"]);
  const end = t.mock.method(nativeBridge, "end", async () => {});
  await raceLiveActivity.getActive(fakeSession(async () => ({ live_activities: [] })));
  assert.deepEqual(end.mock.calls.map((call) => call.arguments), [["old-orphan"]]);
});

test("a rejected follow closes the newly started native activity", async (t) => {
  t.mock.method(nativeBridge, "isSupported", async () => true);
  t.mock.method(nativeBridge, "start", async () => ({ activityId: "new-native-id", pushToken: "" }));
  const end = t.mock.method(nativeBridge, "end", async () => {});
  const session = fakeSession(async () => {
    throw new ApiError("Already following", 409, "already_following");
  });
  await assert.rejects(raceLiveActivity.start(session, {
    eventId: "event-1", eventName: "Test race", location: "Test start", startTime: "2026-10-01T00:00:00Z", status: "upcoming",
  }), (error: unknown) => error instanceof LiveActivityError && error.reason === "already_following");
  assert.deepEqual(end.mock.calls.map((call) => call.arguments), [["new-native-id"]]);
});

test("native cleanup failure preserves the original backend failure", async (t) => {
  t.mock.method(nativeBridge, "isSupported", async () => true);
  t.mock.method(nativeBridge, "start", async () => ({ activityId: "new-native-id", pushToken: "" }));
  t.mock.method(nativeBridge, "end", async () => { throw new Error("Native cleanup failed"); });
  const session = fakeSession(async () => { throw new ApiError("Offline", 0, "network_error"); });
  await assert.rejects(raceLiveActivity.start(session, {
    eventId: "event-1", eventName: "Test race", location: "Test start", startTime: "2026-10-01T00:00:00Z", status: "upcoming",
  }), (error: unknown) => error instanceof LiveActivityError && error.message === "Offline");
});
test("start() reports unsupported_device when the native bridge has no real implementation yet", async () => {
  const session = fakeSession(async () => {
    throw new Error("should never reach the backend if native start fails first");
  });
  await assert.rejects(
    raceLiveActivity.start(session, {
      eventId: "event-1",
      eventName: "Unity Runn 10K",
      location: "Phnom Penh",
      startTime: "2026-01-01T06:00:00Z",
      status: "upcoming",
    }),
    (error: unknown) => {
      assert.ok(error instanceof LiveActivityError);
      assert.equal(error.reason, "unsupported_device");
      return true;
    },
  );
});
test("end() never throws even when the backend has nothing to end (idempotent per the backend contract)", async () => {
  const session = fakeSession(async (path, options) => {
    assert.equal(path, "/api/v1/live-activities/activity-1");
    assert.equal(options?.method, "DELETE");
    return { ended: true };
  });
  await assert.doesNotReject(
    raceLiveActivity.end(session, { id: "activity-1", activityId: "native-1" }),
  );
});
test("end() wraps a real backend failure into LiveActivityError instead of leaking ApiError", async () => {
  const session = fakeSession(async () => {
    throw new ApiError("boom", 500, "internal_error");
  });
  await assert.rejects(
    raceLiveActivity.end(session, { id: "activity-1", activityId: "native-1" }),
    (error: unknown) => {
      assert.ok(error instanceof LiveActivityError);
      assert.equal(error.reason, "network_error");
      return true;
    },
  );
});
test("getActive() unwraps the { live_activities } envelope", async () => {
  const rows = [
    {
      id: "a1",
      user_id: "u1",
      event_id: "e1",
      activity_id: "act-1",
      platform: "ios" as const,
      status: "ACTIVE" as const,
      race_status: "LIVE" as const,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
  const session = fakeSession(async (path) => {
    assert.equal(path, "/api/v1/live-activities");
    return { live_activities: rows };
  });
  const result = await raceLiveActivity.getActive(session);
  assert.deepEqual(result, rows);
});
test("getActive() wraps a network failure into LiveActivityError with reason network_error", async () => {
  const session = fakeSession(async () => {
    throw new ApiError("offline", 0, "network_error");
  });
  await assert.rejects(
    raceLiveActivity.getActive(session),
    (error: unknown) => {
      assert.ok(error instanceof LiveActivityError);
      assert.equal(error.reason, "network_error");
      return true;
    },
  );
});
test("restore() is getActive() by another name (same backend call, same shape)", async () => {
  let calls = 0;
  const session = fakeSession(async () => {
    calls++;
    return { live_activities: [] };
  });
  await raceLiveActivity.restore(session);
  assert.equal(calls, 1);
});
test("getPushToken() never throws, even though no native bridge exists yet", async () => {
  const token = await raceLiveActivity.getPushToken("activity-1");
  assert.equal(token, null);
});
test("update() calls the native bridge before ever touching the backend", async () => {
  // The native bridge always throws unsupported right now (no real
  // implementation exists yet), so every update() call rejects before the
  // backend PATCH is reached regardless of payload -- this is the honest
  // current behavior, not a gap: a distanceKm/pace update is native-timer-
  // driven and was never meant to reach the backend at all (see the
  // service's own doc comment on why only race_status is persisted).
  let backendCalls = 0;
  const session = fakeSession(async () => {
    backendCalls++;
    return {};
  });
  await assert.rejects(
    raceLiveActivity.update(
      session,
      { id: "activity-1", activityId: "native-1" },
      { distanceKm: 6.4 },
    ),
    (error: unknown) => {
      assert.ok(error instanceof LiveActivityError);
      assert.equal(error.reason, "unsupported_device");
      return true;
    },
  );
  assert.equal(backendCalls, 0);
});
test("reconcileOrphans() never throws, and touches no backend call, against the honest stub bridge", async () => {
  // tsx --test resolves the plain nativeBridge.ts stub (no Metro platform
  // resolution here -- see that file's own doc comment), whose
  // getRunningActivityIds() always reports [] since there's no real
  // ActivityKit to ask. That makes every backend-known activity trivially
  // "not orphaned" in this environment; the real orphan-filtering logic
  // only runs against nativeBridge.ios.ts on-device. What this test can
  // honestly cover is the contract every caller actually depends on: it's
  // safe to call unconditionally and never touches the network itself.
  const active = [
    {
      id: "a1",
      user_id: "u1",
      event_id: "e1",
      activity_id: "act-1",
      platform: "ios" as const,
      status: "ACTIVE" as const,
      race_status: "LIVE" as const,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
  await assert.doesNotReject(raceLiveActivity.reconcileOrphans(active, []));
});
