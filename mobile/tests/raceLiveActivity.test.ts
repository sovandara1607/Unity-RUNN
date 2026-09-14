import assert from "node:assert/strict";
import { test } from "node:test";
import { raceLiveActivity } from "../services/liveActivity/raceLiveActivity.service";
import { LiveActivityError } from "../services/liveActivity/types";
import { ApiError } from "../services/api/client";
// A minimal fake matching only the `.request` surface raceLiveActivity
// actually calls -- see services/auth/session.ts's real Session class for
// the full shape this stands in for.
function fakeSession(handler: (path: string, options?: any) => Promise<any>) {
  return { request: handler } as any;
}
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
