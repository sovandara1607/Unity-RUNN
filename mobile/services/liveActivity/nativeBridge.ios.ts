import { Platform } from "react-native";
import { awaitPushToken } from "./pushToken";
import { initialContent, parseSavedContent, updatedContent } from "./contentState";
import * as SecureStore from "expo-secure-store";
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
// Persist the full state so patches after an app restart retain the race details.
const instances = new Map<string, LiveActivity<RaceActivityProps>>();
const lastProps = new Map<string, RaceActivityProps>();
const contentKey = (id: string) => `live-activity.${id}`;
const storageOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

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
    const props = initialContent(input);
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
    try {
      await SecureStore.setItemAsync(contentKey(activityId), JSON.stringify(props), storageOptions);
    } catch (error) {
      await instance.end("immediate").catch(() => undefined);
      instances.delete(activityId);
      lastProps.delete(activityId);
      throw error;
    }
    const pushToken = await awaitPushToken(instance);
    return { activityId, pushToken };
  },

  async update(activityId: string, input: NativeUpdateInput): Promise<void> {
    const instance = findInstance(activityId);
    if (!instance) {
      throw new LiveActivityUnsupportedError(`No running Live Activity with id ${activityId}.`);
    }
    const previous = lastProps.get(activityId) ?? parseSavedContent(
      await SecureStore.getItemAsync(contentKey(activityId), storageOptions),
    );
    if (!previous) {
      throw new Error("Cannot update a restored Live Activity without its saved content.");
    }
    const merged = updatedContent(previous, input);
    await instance.update(merged);
    lastProps.set(activityId, merged);
    // Best-effort cache for cold-start recovery only -- a write failure here must not
    // undo the on-device update that already succeeded, or block the caller's backend PATCH.
    await SecureStore.setItemAsync(contentKey(activityId), JSON.stringify(merged), storageOptions).catch(() => undefined);
  },

  async end(activityId: string): Promise<void> {
    const instance = findInstance(activityId);
    // Safe no-op if nothing's running under this id -- matches the backend's
    // own End() idempotency and raceLiveActivity.service.ts's documented
    // "safe to call unconditionally" contract.
    try {
      if (instance) await instance.end("immediate");
    } finally {
      instances.delete(activityId);
      lastProps.delete(activityId);
      await SecureStore.deleteItemAsync(contentKey(activityId), storageOptions).catch(() => undefined);
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
