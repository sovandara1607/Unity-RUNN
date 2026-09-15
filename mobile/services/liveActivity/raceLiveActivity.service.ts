import { ApiError } from "../api/client";
import type { useApi } from "../api/provider";
import type { LiveActivityRecord, RaceLiveActivityStatus } from "../api/types";
import { nativeBridge, LiveActivityUnsupportedError } from "./nativeBridge";
import { LiveActivityError, type RaceLiveActivityData } from "./types";
type Session = ReturnType<typeof useApi>["session"];
/** update()/end() need two different ids for two different systems: the
 * backend's own row id (what `/api/v1/live-activities/:id` is keyed by --
 * see backend/internal/liveactivities/handler.go's `uuid.Parse(chi.URLParam(...))`)
 * and ActivityKit's own id (what the native bridge's instance map is keyed
 * by -- see nativeBridge.ios.ts's `findInstance()`). A single "activityId"
 * string here would silently target the wrong one of the two; callers
 * already have both from the `LiveActivityRecord` they're acting on. */
export type LiveActivityRef = { id: string; activityId: string };
let startsInFlight = 0;
let startGeneration = 0;

const STATE_TO_BACKEND: Record<RaceLiveActivityData["status"], RaceLiveActivityStatus> = {
  upcoming: "UPCOMING",
  check_in: "CHECK_IN",
  starting: "STARTING",
  live: "LIVE",
  finished: "FINISHED",
  cancelled: "CANCELLED",
};
function wrap(error: unknown): LiveActivityError {
  if (error instanceof LiveActivityUnsupportedError) {
    return new LiveActivityError(error.message, "unsupported_device");
  }
  if (error instanceof ApiError) {
    if (error.code === "already_following") {
      return new LiveActivityError(error.message, "already_following");
    }
    if (error.status === 404) {
      return new LiveActivityError(error.message, "not_found");
    }
    return new LiveActivityError(error.message, "network_error");
  }
  return new LiveActivityError(
    error instanceof Error ? error.message : "Something went wrong.",
    "network_error",
  );
}
/**
 * Clean API around Live Activities -- screens call these, never the native
 * bridge or the /api/v1/live-activities endpoints directly (item 8's own
 * framing). Every method:
 *   - is a no-op-safe no-throw on Android (native bridge reports unsupported)
 *   - wraps failures into LiveActivityError with a typed `reason`
 *   - keeps the app's normal function entirely independent of whether any
 *     of this succeeds
 */
export const raceLiveActivity = {
  /** Begin following an event. Explicit opt-in only -- callers decide when
   * "Follow Live" was tapped; this never auto-starts (item 9's own rule). */
  async start(
    session: Session,
    data: RaceLiveActivityData,
    opts: { registrationId?: string; deviceId?: string } = {},
  ): Promise<LiveActivityRecord> {
    let nativeActivityId: string | undefined;
    startsInFlight++;
    startGeneration++;
    try {
      // nativeBridge.isSupported() is the single source of truth for
      // platform/OS-version support (including "this isn't iOS at all") --
      // deliberately not duplicated here, see nativeBridge.ts's own comment.
      const supported = await nativeBridge.isSupported();
      if (!supported) {
        throw new LiveActivityUnsupportedError(
          "Live Activities are not available in this build yet.",
        );
      }
      const native = await nativeBridge.start({
        eventId: data.eventId,
        eventName: data.eventName,
        location: data.location,
        raceDistance: data.raceDistance,
        startTime: data.startTime,
        bibNumber: data.bibNumber,
        gate: data.gate,
        status: data.status,
        elapsedSeconds: data.elapsedSeconds,
        distanceKm: data.distanceKm,
        pace: data.pace,
        finishTime: data.finishTime,
      });
      nativeActivityId = native.activityId;
      return await session.request<LiveActivityRecord>("/api/v1/live-activities", {
        method: "POST",
        body: {
          event_id: data.eventId,
          registration_id: opts.registrationId,
          activity_id: native.activityId,
          push_token: native.pushToken,
          device_id: opts.deviceId ?? "",
          platform: "ios",
        },
      });
    } catch (error) {
      if (nativeActivityId) {
        // A rejected follow must not leave a second activity visible on the phone.
        await nativeBridge.end(nativeActivityId).catch(() => undefined);
      }
      throw wrap(error);
    } finally {
      startsInFlight--;
      startGeneration++;
    }
  },
  /** Patch race status (and, per item 6/14, native-timer-driven progress
   * numbers that never touch the backend -- only race_status is persisted;
   * distanceKm/elapsedSeconds/pace update the on-device activity directly
   * via the native bridge so this never sends a network request per tick). */
  async update(
    session: Session,
    ref: LiveActivityRef,
    patch: Partial<RaceLiveActivityData>,
  ): Promise<LiveActivityRecord | void> {
    try {
      await nativeBridge.update(ref.activityId, {
        raceStatus: patch.status,
        distanceKm: patch.distanceKm,
        elapsedSeconds: patch.elapsedSeconds,
        pace: patch.pace,
        finishTime: patch.finishTime,
      });
      if (!patch.status) return;
      return await session.request<LiveActivityRecord>(
        `/api/v1/live-activities/${ref.id}`,
        { method: "PATCH", body: { race_status: STATE_TO_BACKEND[patch.status] } },
      );
    } catch (error) {
      throw wrap(error);
    }
  },
  /** Convenience wrapper for the one update every activity eventually gets:
   * item 7's "FINISHED" state with a finish time. */
  async finish(
    session: Session,
    ref: LiveActivityRef,
    result: { finishTime: string },
  ): Promise<LiveActivityRecord | void> {
    return raceLiveActivity.update(session, ref, {
      status: "finished",
      finishTime: result.finishTime,
    });
  },
  /** Stop following. Safe to call unconditionally -- both the native bridge
   * and the backend's DELETE treat ending an already-ended/unknown activity
   * as a success, not an error. */
  async end(session: Session, ref: LiveActivityRef): Promise<void> {
    try {
      await nativeBridge.end(ref.activityId);
    } catch {
      // Close the backend record even if native dismissal needs a later retry.
    }
    try {
      await session.request<void>(`/api/v1/live-activities/${ref.id}`, {
        method: "DELETE",
      });
    } catch (error) {
      throw wrap(error);
    }
  },
  /** What the caller is currently following -- backs Race Wallet button
   * states (item 9) and the "restore on app open" flow (item 15's cold-start
   * case: the backend row is the source of truth, not local device state). */
  async getActive(session: Session): Promise<LiveActivityRecord[]> {
    try {
      const generation = startGeneration;
      const runningIds = await nativeBridge.getRunningActivityIds().catch(() => [] as string[]);
      const result = await session.request<{ live_activities: LiveActivityRecord[] }>(
        "/api/v1/live-activities",
      );
      // Only compare activities that existed before this backend snapshot.
      // A concurrent follow may not have reached the server yet.
      if (startsInFlight === 0 && generation === startGeneration) {
        void raceLiveActivity.reconcileOrphans(result.live_activities, runningIds);
      }
      return result.live_activities;
    } catch (error) {
      throw wrap(error);
    }
  },
  /** Re-sync after the app was backgrounded/killed and reopened. Distinct
   * from getActive() in intent, not implementation: restore() is what a
   * screen calls once on mount to reconcile local UI state with the
   * backend's, while getActive() is what the Wallet list calls per-render. */
  async restore(session: Session): Promise<LiveActivityRecord[]> {
    return raceLiveActivity.getActive(session);
  },
  /** End activities absent from a backend snapshot, using only device IDs
   * captured before that request and after checking for concurrent starts. */
  async reconcileOrphans(active: LiveActivityRecord[], runningIds: string[]): Promise<void> {
    try {
      const knownIds = new Set(active.map((record) => record.activity_id));
      const orphaned = runningIds.filter((id) => !knownIds.has(id));
      await Promise.all(orphaned.map((id) => nativeBridge.end(id).catch(() => {})));
    } catch {
      // Best-effort only, per the doc comment above.
    }
  },

  /** The activity's own APNs push-to-update token, for debugging/support --
   * normal app code never needs this (start() already sends it to the
   * backend). Returns null on Android, on unsupported devices, or if the
   * native layer fails to hand one back -- never throws, per item 8's
   * "handle errors gracefully if ... push-token retrieval fails." */
  async getPushToken(activityId: string): Promise<string | null> {
    try {
      return await nativeBridge.getPushToken(activityId);
    } catch {
      return null;
    }
  },
};
