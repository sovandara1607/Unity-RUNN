import assert from "node:assert/strict";
import { test } from "node:test";
import { createTransport, ApiError } from "../services/api/client";
import {
  assetUrl,
  eventDate,
  eventTime,
  money,
} from "../features/events/format";
test("transport unwraps API envelope and sends explicit bearer without cookies", async () => {
  const request = createTransport("https://api.example.com", (async (
    url,
    options,
  ) => {
    assert.equal(url, "https://api.example.com/api/v1/me/");
    assert.equal(options?.credentials, "omit");
    assert.equal(
      (options?.headers as Record<string, string>).Authorization,
      "Bearer access",
    );
    return Response.json({ data: { id: "runner" } });
  }) as typeof fetch);
  assert.deepEqual(await request("/api/v1/me/", { token: "access" }), {
    id: "runner",
  });
});
test("non-JSON gateway error is normalized and writes are not retried", async () => {
  let calls = 0;
  const request = createTransport("https://api.example.com", (async () => {
    calls++;
    return new Response("Bad gateway", { status: 502 });
  }) as typeof fetch);
  await assert.rejects(
    request("/api/v1/auth/mobile/login", { method: "POST", body: {} }),
    (error: ApiError) => error.status === 502 && error.code === "http_error",
  );
  assert.equal(calls, 1);
});
test("timeout is bounded and distinct from cancellation", async () => {
  const hanging = (async (_url, options) =>
    new Promise((_resolve, reject) =>
      options?.signal?.addEventListener("abort", () => reject(Error("abort"))),
    )) as typeof fetch;
  const request = createTransport("https://api.example.com", hanging, 10);
  await assert.rejects(
    request("/api/v1/events/"),
    (error: ApiError) => error.code === "timeout",
  );
});
test("date/time and KHR preserve backend semantics", () => {
  assert.equal(eventTime("0000-01-01T05:30:00Z"), "05:30");
  assert.equal(eventDate("2026-12-06T00:00:00Z", true), "6 Dec");
  assert.equal(money(10000, "KHR"), "10,000 KHR");
  assert.equal(money(1500, "USD"), "$15.00 USD");
});
test("assets resolve against their owner and reject non-HTTP schemes", () => {
  const resolve = (path: string) =>
    assetUrl(path, "https://api.example.com", "https://web.example.com");
  assert.equal(
    resolve("/uploads/events/a.jpg"),
    "https://api.example.com/uploads/events/a.jpg",
  );
  assert.equal(
    resolve("/api/v1/media/a.jpg"),
    "https://api.example.com/api/v1/media/a.jpg",
  );
  assert.equal(
    resolve("/images/club/a.jpg"),
    "https://web.example.com/images/club/a.jpg",
  );
  assert.equal(
    resolve("https://cdn.example.com/a.jpg"),
    "https://cdn.example.com/a.jpg",
  );
  assert.equal(resolve("javascript:alert(1)"), undefined);
  assert.equal(resolve("//untrusted.example/a.jpg"), undefined);
});
