import assert from "node:assert";
import { before, test } from "node:test";
import type { NativeBridge } from "../services/liveActivity/nativeBridge.types";
// The real bridge imports react-native / expo-secure-store / the SwiftUI widget file
// directly, none of which parse or run under plain Node -- Metro's platform-extension
// resolution is what normally keeps this file iOS-only. Module mocking swaps all three
// out before nativeBridge.ios.ts is ever imported, so its own start()/update()/end()
// logic runs for real against fakes instead of never being reachable by any test.
let currentSetItem = async (_key: string, _value: string) => {};
let currentGetItem = async (_key: string): Promise<string | null> => null;
let currentDeleteItem = async (_key: string) => {};
test.mock.module("expo-secure-store", {
  exports: {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
    setItemAsync: (key: string, value: string) => currentSetItem(key, value),
    getItemAsync: (key: string) => currentGetItem(key),
    deleteItemAsync: (key: string) => currentDeleteItem(key),
  },
});
test.mock.module("react-native", { exports: { Platform: { OS: "ios", Version: "18.0" } } });
let currentStart = (_props: unknown): FakeInstance => {
  throw new Error("no fake instance configured for this test");
};
test.mock.module("../widgets/RaceLiveActivity", {
  // getInstances() backs findInstance()'s cold-start fallback lookup -- it runs
  // unguarded (no try/catch) whenever an id isn't in the in-memory map, so it must
  // exist even though these tests never rely on cold-start recovery.
  exports: { default: { start: (props: unknown) => currentStart(props), getInstances: () => [] } },
});

type FakeInstance = {
  getId(): string;
  end(style: string): Promise<void>;
  update(props: unknown): Promise<void>;
  addPushTokenListener(cb: (event: { pushToken: string }) => void): { remove(): void };
  getPushToken(): Promise<string | null>;
};
function fakeInstance(id: string, overrides: Partial<FakeInstance> = {}): FakeInstance {
  return {
    getId: () => id,
    end: async () => {},
    update: async () => {},
    addPushTokenListener: () => ({ remove: () => {} }),
    // A real token, not null: awaitPushToken() (pushToken.ts) only resolves early
    // when getPushToken() hands back something truthy -- null falls through to its
    // 4s timeout, which would make every start() in these tests take 4+ seconds.
    getPushToken: async () => "fake-push-token",
    ...overrides,
  };
}
function resetSecureStore() {
  currentSetItem = async () => {};
  currentGetItem = async () => null;
  currentDeleteItem = async () => {};
}
const startInput = {
  eventId: "event-1",
  eventName: "Riverside Run",
  location: "Riverside",
  startTime: "2026-10-18T00:00:00Z",
  status: "live" as const,
};

let nativeBridge: NativeBridge;
before(async () => {
  ({ nativeBridge } = await import("../services/liveActivity/nativeBridge.ios"));
});

test("end() clears the local instance even when instance.end() throws", async (t) => {
  resetSecureStore();
  const deleteItem = t.mock.fn(currentDeleteItem);
  currentDeleteItem = deleteItem;
  const endMock = t.mock.fn(async () => { throw new Error("ActivityKit refused to end"); });
  currentStart = () => fakeInstance("act-throws-on-end", { end: endMock });

  const { activityId } = await nativeBridge.start(startInput);
  await assert.rejects(nativeBridge.end(activityId), /ActivityKit refused to end/);

  // The in-memory map must have been cleared despite the throw, or a later call would
  // still find the "zombie" instance instead of correctly reporting nothing is running.
  await assert.rejects(
    nativeBridge.update(activityId, { raceStatus: "finished" }),
    /No running Live Activity/,
  );
  assert.equal(deleteItem.mock.callCount(), 1);
});

test("update() keeps the on-device update and the in-memory cache when the SecureStore write fails", async (t) => {
  resetSecureStore();
  const updateMock = t.mock.fn(async () => {});
  currentStart = () => fakeInstance("act-secure-store-fails", { update: updateMock });

  const { activityId } = await nativeBridge.start(startInput);
  currentSetItem = async () => { throw new Error("keychain locked"); };

  // Before the fix this rejected, which meant the caller's backend PATCH for
  // race_status never ran even though the widget itself had already updated.
  await nativeBridge.update(activityId, { raceStatus: "finished", finishTime: "2026-10-18T01:02:03Z" });

  assert.equal(updateMock.mock.callCount(), 1);
  const { eventId: _eventId, ...expectedContent } = startInput;
  assert.deepEqual(updateMock.mock.calls[0].arguments[0], {
    ...expectedContent,
    status: "finished",
    finishTime: "2026-10-18T01:02:03Z",
  });

  // A later update must still work from the in-memory cache, proving state wasn't
  // corrupted by the earlier persistence failure.
  currentSetItem = async () => {};
  await nativeBridge.update(activityId, { distanceKm: 5.2 });
  assert.equal(updateMock.mock.calls[1].arguments[0].distanceKm, 5.2);
});
