import { io, type Socket } from "socket.io-client";
import type { SiteConfig } from "../types";

interface ServerToClientEvents {
  "realtime:ready": (payload: { connected: boolean }) => void;
  "site-config:updated": (config: SiteConfig) => void;
}

type ClientToServerEvents = Record<never, never>;

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getRealtimeSocket() {
  if (typeof window === "undefined") return null;
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_REALTIME_URL || "http://localhost:8081", {
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      timeout: 8_000,
    });
  }
  return socket;
}
