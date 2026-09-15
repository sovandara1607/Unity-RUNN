import { io, type Socket } from "socket.io-client";

// Public change signals contain no registration or user identifiers.
type ServerToClientEvents = {
  "realtime:ready": (payload: { connected: boolean }) => void;
  "events:changed": () => void;
  "registrations:changed": () => void;
};
type ClientToServerEvents = Record<never, never>;

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Returns null when EXPO_PUBLIC_REALTIME_URL isn't configured -- push
 * updates are an enhancement, not a requirement (see constants/config.ts). */
export function createRealtimeSocket(realtimeOrigin: string | undefined): RealtimeSocket | null {
  if (!realtimeOrigin) return null;
  return io(realtimeOrigin, {
      autoConnect: false,
      // websocket-only, unlike the web client's ["websocket","polling"] --
      // RN's XHR polyfill makes engine.io's HTTP long-polling transport
      // unreliable, and there's no corporate-proxy reason to fall back to it
      // on a phone the way there might be in a browser.
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      timeout: 8_000,
    });
}
