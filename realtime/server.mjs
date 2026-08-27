import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { Server } from "socket.io";

const port = Number.parseInt(process.env.PORT || "8081", 10);
const siteConfigChannel = "unity:realtime:site-config";
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
    callback(null, !origin || allowedOrigins.includes(origin));
  },
});

io.adapter(createAdapter(adapterPublisher, adapterSubscriber));

io.on("connection", (socket) => {
  socket.emit("realtime:ready", { connected: true });

  // This public namespace is outbound-only. Business mutations continue to go
  // through the authenticated Go API, never through a browser socket event.
  socket.onAny(() => socket.disconnect(true));
});

await domainSubscriber.subscribe(siteConfigChannel);
domainSubscriber.on("message", (channel, rawPayload) => {
  if (channel !== siteConfigChannel) return;
  try {
    io.emit("site-config:updated", JSON.parse(rawPayload));
  } catch (error) {
    console.error(JSON.stringify({ event: "realtime_invalid_payload", error: String(error) }));
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
