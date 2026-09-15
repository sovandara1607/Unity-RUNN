import assert from "node:assert/strict";
import { test } from "node:test";
import { initialContent, parseSavedContent, updatedContent } from "../services/liveActivity/contentState";
import { awaitPushToken } from "../services/liveActivity/pushToken";

const race = {
  eventId: "event-1",
  eventName: "Community run",
  location: "Olympic Stadium",
  startTime: "2026-10-01T00:00:00Z",
  status: "live" as const,
  bibNumber: "860",
  elapsedSeconds: 120,
  distanceKm: 0.5,
  pace: "4:00",
};

test("progress survives start and unrelated updates do not reset the timer", () => {
  const initial = initialContent(race, 1_000_000);
  assert.equal(initial.elapsedStartedAt, 880_000);
  assert.equal(initial.distanceKm, 0.5);
  const later = updatedContent(initial, { pace: "4:10" }, 1_030_000);
  assert.equal(later.elapsedStartedAt, 880_000);
  assert.equal((1_030_000 - later.elapsedStartedAt!) / 1000, 150);
  assert.equal(later.eventName, race.eventName);
  const corrected = updatedContent(later, { elapsedSeconds: 155 }, 1_040_000);
  assert.equal(corrected.elapsedStartedAt, 885_000);
});

test("saved content restores race details and the original timer after a restart", () => {
  const saved = JSON.stringify(initialContent(race, 1_000_000));
  const restored = parseSavedContent(saved);
  assert.ok(restored);
  const next = updatedContent(restored, { distanceKm: 1 }, 1_090_000);
  assert.equal(next.eventName, race.eventName);
  assert.equal(next.bibNumber, race.bibNumber);
  assert.equal(next.pace, race.pace);
  assert.equal(next.elapsedStartedAt, 880_000);
  assert.equal(next.distanceKm, 1);
});

test("missing or corrupt persisted state cannot replace native content", () => {
  for (const value of [null, "{", "{}", '{"status":"invalid"}', JSON.stringify({ ...race, elapsedSeconds: "120" })]) {
    assert.equal(parseSavedContent(value), undefined);
  }
});

test("a synchronously delivered token cleans up its listener", async () => {
  let removed = 0;
  const result = await awaitPushToken({
    addPushTokenListener(listener) {
      listener({ pushToken: "cached-token" });
      return { remove() { removed++; } };
    },
    async getPushToken() { throw new Error("not needed"); },
  });
  assert.equal(result, "cached-token");
  assert.equal(removed, 1);
});

test("a failed token listener still allows the getter to succeed", async () => {
  assert.equal(await awaitPushToken({
    addPushTokenListener() { throw new Error("subscriptions unavailable"); },
    async getPushToken() { return "getter-token"; },
  }), "getter-token");
});

test("token failures time out and remove the listener without failing start", async () => {
  let removed = 0;
  assert.equal(await awaitPushToken({
    addPushTokenListener() { return { remove() { removed++; throw new Error("native cleanup"); } }; },
    async getPushToken() { throw new Error("APNs unavailable"); },
  }, 5), "");
  assert.equal(removed, 1);
});

test("the first valid token wins and later token events are ignored", async () => {
  let listener!: (event: { pushToken: string }) => void;
  let removed = 0;
  const result = awaitPushToken({
    addPushTokenListener(callback) {
      listener = callback;
      return { remove() { removed++; } };
    },
    async getPushToken() { return "getter-token"; },
  });
  listener({ pushToken: "" });
  listener({ pushToken: "event-token" });
  assert.equal(await result, "event-token");
  listener({ pushToken: "late-token" });
  assert.equal(removed, 1);
});
