import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { Server } from "socket.io";
import { siteConfigChannel, eventsChannel, registrationsChannel, relayDomainEvent } from "./domain-events.mjs";

const port = Number.parseInt(process.env.PORT || "8081", 10);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function redisClient() {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }
  return new Redis({
    host: process.env.REDIS_HOST || "redis",
    port: Number.parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB || "0", 10),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

const adapterPublisher = redisClient();
const adapterSubscriber = adapterPublisher.duplicate();
const domainSubscriber = adapterPublisher.duplicate();

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    const ready = adapterPublisher.status === "ready" && domainSubscriber.status === "ready";
    response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: ready ? "ok" : "unavailable" }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

const io = new Server(httpServer, {
  serveClient: false,
  maxHttpBufferSize: 100_000,
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  allowRequest: (request, callback) => {
    const origin = request.headers.origin;
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    // A non-browser client (React Native's WebSocket, socket.io-client on
    // mobile) has no real page origin to report, so it sets Origin to the
    // socket's own target URL -- which makes it equal to this request's own
    // Host. A genuine cross-origin browser request's Origin names a
    // DIFFERENT site than the one being asked to serve it, so this still
    // rejects that case exactly as before; it only additionally accepts the
    // self-origin case, without hardcoding a dev host/port/LAN IP that would
    // vary per machine and per device.
    try {
      return callback(null, new URL(origin).host === request.headers.host);
    } catch {
      return callback(null, false);
    }
  },
});

io.adapter(createAdapter(adapterPublisher, adapterSubscriber));

io.on("connection", (socket) => {
  socket.emit("realtime:ready", { connected: true });

  // This public namespace is outbound-only. Business mutations continue to go
  // through the authenticated Go API, never through a browser socket event.
  socket.onAny(() => socket.disconnect(true));
});

await domainSubscriber.subscribe(siteConfigChannel, eventsChannel, registrationsChannel);
domainSubscriber.on("message", (channel, rawPayload) => {
  try {
    relayDomainEvent(io, channel, rawPayload);
  } catch (error) {
    console.error(JSON.stringify({ event: "realtime_invalid_payload", channel, error: String(error) }));
  }
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "realtime_started", port, origins: allowedOrigins }));
});

async function shutdown(signal) {
  console.log(JSON.stringify({ event: "realtime_stopping", signal }));
  io.close();
  await Promise.allSettled([
    adapterPublisher.quit(),
    adapterSubscriber.quit(),
    domainSubscriber.quit(),
  ]);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
