export type RaceLiveActivityState =
  | "upcoming"
  | "check_in"
  | "starting"
  | "live"
  | "finished"
  | "cancelled";
/** Static-vs-frequently-changing split, per the brief this shipped from:
 * everything above `status` rarely changes after start() and is what
 * CreateInput sends to the backend; everything from `elapsedSeconds` down
 * changes often and is update()-only, never persisted server-side (see
 * backend/internal/liveactivities/model.go UpdateInput). */
export type RaceLiveActivityData = {
  eventId: string;
  eventName: string;
  location: string;
  raceDistance?: string;
  startTime: string;
  status: RaceLiveActivityState;
  bibNumber?: string;
  gate?: string;
  elapsedSeconds?: number;
  distanceKm?: number;
  pace?: string;
  finishTime?: string;
};
/** One of raceLiveActivity's typed failure modes, distinct from a plain
 * thrown Error so UI code can pattern-match instead of parsing message
 * strings (item 8: "handle errors gracefully"). */
export type LiveActivityErrorReason =
  | "unsupported_device" // iOS < 16.2, or a non-Dynamic-Island device where only Lock Screen applies (native bridge still reports supported=true for those -- this is the true "can't do Live Activities at all" case)
  | "not_ios"
  | "permission_denied"
  | "already_following"
  | "not_found"
  | "network_error";
export class LiveActivityError extends Error {
  constructor(
    message: string,
    readonly reason: LiveActivityErrorReason,
  ) {
    super(message);
    this.name = "LiveActivityError";
  }
}
