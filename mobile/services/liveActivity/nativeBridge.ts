import {
  LiveActivityUnsupportedError,
  type NativeBridge,
} from "./nativeBridge.types";

export {
  LiveActivityUnsupportedError,
  type NativeBridge,
  type NativeStartInput,
  type NativeStartResult,
  type NativeUpdateInput,
} from "./nativeBridge.types";

/**
 * HONEST STUB -- this project has not installed a native Live Activity
 * package yet (expo-widgets is alpha and not in package.json; see the
 * conversation this shipped from). Every method here reports "unsupported"
 * rather than silently pretending ActivityKit calls succeeded. Swap this
 * file's export for a real implementation once:
 *   1. `expo-widgets` (or expo-live-activity / expo-apple-targets) is
 *      installed and `expo prebuild` has regenerated the native ios/ project
 *      with the new Widget Extension target, and
 *   2. that's been verified on a physical Dynamic-Island device, not just
 *      compiled.
 * Nothing else in raceLiveActivity.service.ts needs to change when that
 * happens -- it only ever talks to the NativeBridge interface above.
 *
 * UPDATE: done -- see nativeBridge.ios.ts, which Metro picks over this file
 * for the iOS bundle. This file now covers Android, web, and the plain
 * `tsx --test` unit test runner (see that file's own doc comment for why
 * that split, rather than editing this file in place, was the right call).
 */
export const nativeBridge: NativeBridge = {
  async isSupported() {
    // Unconditionally false, on every platform: there's no real native
    // module to differentiate iOS/Android/OS-version on yet (see doc
    // comment above). A real implementation replacing this file is where
    // that platform check belongs, not here.
    return false;
  },
  async start() {
    throw new LiveActivityUnsupportedError(
      "Live Activities are not available in this build yet.",
    );
  },
  async update() {
    throw new LiveActivityUnsupportedError(
      "Live Activities are not available in this build yet.",
    );
  },
  async end() {
    // Ending something that was never really started is a safe no-op --
    // matches the backend's own End() idempotency (see liveactivities.Repository.End).
  },
  async getPushToken() {
    return null;
  },
  async getRunningActivityIds() {
    return [];
  },
};
