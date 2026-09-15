/**
 * Shared contract between the two nativeBridge implementations
 * (`nativeBridge.ts`, the honest stub, and `nativeBridge.ios.ts`, the real
 * ActivityKit-backed one). Lives in its own file with no platform-suffix
 * sibling on purpose: Metro's platform-extension resolution applies to
 * every `./nativeBridge` import, including one written *inside*
 * `nativeBridge.ios.ts` itself, which would otherwise resolve back to that
 * same file and create a require cycle (caught via a Metro warning during
 * the on-device Live Activity test this file's split fixed).
 */

/** What the on-device ActivityKit call needs to render the very first Dynamic
 * Island / Lock Screen state. Everything that changes after that (distance,
 * pace, elapsed time, race_status) goes through update(), not a re-start. */
export type NativeStartInput = {
  eventId: string;
  eventName: string;
  location: string;
  raceDistance?: string;
  startTime: string;
  bibNumber?: string;
  gate?: string;
  elapsedSeconds?: number;
  distanceKm?: number;
  pace?: string;
  finishTime?: string;
  status:
    | "upcoming"
    | "check_in"
    | "starting"
    | "live"
    | "finished"
    | "cancelled";
};
export type NativeStartResult = { activityId: string; pushToken: string };
export type NativeUpdateInput = {
  raceStatus?:
    | "upcoming"
    | "check_in"
    | "starting"
    | "live"
    | "finished"
    | "cancelled";
  distanceKm?: number;
  elapsedSeconds?: number;
  pace?: string;
  finishTime?: string;
};
export type NativeBridge = {
  isSupported(): Promise<boolean>;
  start(input: NativeStartInput): Promise<NativeStartResult>;
  update(activityId: string, input: NativeUpdateInput): Promise<void>;
  end(activityId: string): Promise<void>;
  getPushToken(activityId: string): Promise<string | null>;
  /** Every Live Activity id ActivityKit currently has running on-device,
   * regardless of whether this app process has any record of it -- backs
   * orphan cleanup (see raceLiveActivity.service.ts's reconcile()): a
   * device-side activity whose backend row was deleted out from under it
   * (an admin removing the event, a cleared dev database) has no other way
   * to ever be told to end, since this app has no APNs push credentials to
   * reach it remotely. Empty on every platform without real ActivityKit. */
  getRunningActivityIds(): Promise<string[]>;
};
/** Thrown by every method on the stub bridge, and by the real bridge when
 * ActivityKit itself reports it can't do Live Activities, so callers get
 * one consistent, catchable signal for "not available" instead of each
 * implementation failing a different way. */
export class LiveActivityUnsupportedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "LiveActivityUnsupportedError";
  }
}
