import { Platform } from "react-native";
import type { LiveActivity } from "expo-widgets";
import raceActivity, { type RaceActivityProps } from "../../widgets/RaceLiveActivity";
import {
  LiveActivityUnsupportedError,
  type NativeBridge,
  type NativeStartInput,
  type NativeStartResult,
  type NativeUpdateInput,
} from "./nativeBridge.types";

// Re-exported so `import { LiveActivityUnsupportedError } from "./nativeBridge"`
// in raceLiveActivity.service.ts still resolves on iOS, where Metro's
// platform-extension resolution sends that bare specifier to *this* file
// instead of the stub -- see nativeBridge.types.ts's own doc comment for why
// the shared class/types live there instead of being redeclared here.
export { LiveActivityUnsupportedError };

/**
 * Real ActivityKit-backed implementation. Only ever bundled for iOS: Metro's
 * platform-extension resolution picks this file (`nativeBridge.ios.ts`) over
 * the plain `nativeBridge.ts` when building the iOS app, while the
 * `tsx --test` unit test runner -- which doesn't do Metro's platform
 * resolution -- keeps resolving the honest stub in `nativeBridge.ts` by
 * ordinary Node module lookup. Neither side needs to change for the other to
 * keep working; see that file's own doc comment for what it still covers
 * (Android, web, and every existing unit test).
 */

// ActivityKit's update() always takes the FULL content state, never a
// patch, but raceLiveActivity.service.ts.update() only ever hands this
// bridge a partial NativeUpdateInput -- so every running activity's last-
// known full props are cached here, patched in place, and re-sent whole.
// KNOWN GAP: an activity recovered by the cold-start reconciliation below
// (app relaunch) has no cached entry until its first update() call after
// relaunch -- a patch arriving before that loses whichever fields the patch
// didn't include, since ActivityKit has no "give me the current state" API
// for the JS side to read back. Not solved here: fixing it means the Wallet
// screen re-sending full RaceLiveActivityData on restore, not this file.
const instances = new Map<string, LiveActivity<RaceActivityProps>>();
const lastProps = new Map<string, RaceActivityProps>();

// Cold-start restore (item 15): an app relaunch loses the two maps above,
// but ActivityKit itself keeps activities running system-wide -- ask it
// what's still alive and re-seed the instance map from that. Wrapped in
// try/catch so a device that can't do Live Activities at all doesn't fail
// module import for the whole app.
try {
  for (const instance of raceActivity.getInstances()) {
    instances.set(instance.getId(), instance);
  }
} catch {
  // Nothing running yet, or unsupported device -- isSupported()/start() are
  // where that gets reported, not here.
}

function findInstance(activityId: string): LiveActivity<RaceActivityProps> | undefined {
  const cached = instances.get(activityId);
  if (cached) return cached;
  const found = raceActivity.getInstances().find((instance) => instance.getId() === activityId);
  if (found) instances.set(activityId, found);
  return found;
}

const PUSH_TOKEN_TIMEOUT_MS = 4000;

/** Races getPushToken() against addPushTokenListener() with a timeout --
 * ActivityKit hands the token back asynchronously and, on the Simulator (no
 * APNs connectivity) or with push notifications off, sometimes never at
 * all. start() still has to return *something*; the backend's push_token
 * field is optional for exactly this reason (see
 * backend/internal/liveactivities/model.go's CreateInput.PushToken). */
function awaitPushToken(instance: LiveActivity<RaceActivityProps>): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const subscription = instance.addPushTokenListener((event) => finish(event.pushToken));
    function finish(token: string) {
      if (settled) return;
      settled = true;
      subscription.remove();
      resolve(token);
    }
    instance
      .getPushToken()
      .then((token) => {
        if (token) finish(token);
      })
      .catch(() => {
        // getPushToken() failing doesn't change the outcome -- the timeout
        // below still resolves with "" the same as a token that never came.
      });
    setTimeout(() => finish(""), PUSH_TOKEN_TIMEOUT_MS);
  });
}

export const nativeBridge: NativeBridge = {
  async isSupported() {
    // Real ActivityKit requires iOS 16.2+ for start()/update(); this app's
    // Podfile deployment target (16.4) already guarantees that on any build
    // that runs at all, so platform alone is the meaningful check here --
    // start() below is still the authoritative signal if a given device
    // genuinely can't do Live Activities (Low Power Mode with them
    // disabled, etc.), reported via the same LiveActivityUnsupportedError.
    return Platform.OS === "ios";
  },

  async start(input: NativeStartInput): Promise<NativeStartResult> {
    const props: RaceActivityProps = {
      eventName: input.eventName,
      location: input.location,
      raceDistance: input.raceDistance,
      startTime: input.startTime,
      status: input.status,
      bibNumber: input.bibNumber,
      gate: input.gate,
    };
    let instance: LiveActivity<RaceActivityProps>;
    try {
      instance = raceActivity.start(props);
    } catch (error) {
      throw new LiveActivityUnsupportedError(
        error instanceof Error
          ? error.message
          : "Live Activities are not available on this device.",
      );
    }
    const activityId = instance.getId();
    instances.set(activityId, instance);
    lastProps.set(activityId, props);
    const pushToken = await awaitPushToken(instance);
    return { activityId, pushToken };
  },

  async update(activityId: string, input: NativeUpdateInput): Promise<void> {
    const instance = findInstance(activityId);
    if (!instance) {
      throw new LiveActivityUnsupportedError(`No running Live Activity with id ${activityId}.`);
    }
    const merged: RaceActivityProps = {
      ...(lastProps.get(activityId) as RaceActivityProps | undefined),
      ...(input.raceStatus !== undefined ? { status: input.raceStatus } : {}),
      ...(input.distanceKm !== undefined ? { distanceKm: input.distanceKm } : {}),
      ...(input.elapsedSeconds !== undefined ? { elapsedSeconds: input.elapsedSeconds } : {}),
      ...(input.pace !== undefined ? { pace: input.pace } : {}),
      ...(input.finishTime !== undefined ? { finishTime: input.finishTime } : {}),
    } as RaceActivityProps;
    await instance.update(merged);
    lastProps.set(activityId, merged);
  },

  async end(activityId: string): Promise<void> {
    const instance = findInstance(activityId);
    // Safe no-op if nothing's running under this id -- matches the backend's
    // own End() idempotency and raceLiveActivity.service.ts's documented
    // "safe to call unconditionally" contract.
    if (!instance) return;
    try {
      await instance.end("default");
    } finally {
      instances.delete(activityId);
      lastProps.delete(activityId);
    }
  },

  async getPushToken(activityId: string): Promise<string | null> {
    const instance = findInstance(activityId);
    if (!instance) return null;
    return instance.getPushToken();
  },

  async getRunningActivityIds(): Promise<string[]> {
    try {
      // Asks ActivityKit directly, not the `instances` cache -- an activity
      // this app process never touched (e.g. one started before the most
      // recent cold-start reconciliation ran) is still real and still
      // showing on the device, and orphan cleanup needs to see it too.
      return raceActivity.getInstances().map((instance) => instance.getId());
    } catch {
      return [];
    }
  },
};
