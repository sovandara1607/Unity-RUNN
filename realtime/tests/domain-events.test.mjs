import assert from "node:assert/strict";
import { test } from "node:test";
import { eventsChannel, registrationsChannel, siteConfigChannel, relayDomainEvent } from "../domain-events.mjs";

function recorder() {
  const emitted = [];
  return {
    emitted,
    io: {
      local: { emit: (...args) => emitted.push(args) },
      emit: () => assert.fail("Redis already delivered this event to every replica"),
    },
  };
}

test("public registration signals discard identifiers from older API replicas", () => {
  const { io, emitted } = recorder();
  relayDomainEvent(io, registrationsChannel, JSON.stringify({ user_id: "private-user-id", email: "private@example.test" }));
  assert.deepEqual(emitted, [["registrations:changed", {}]]);
});

test("domain notifications emit once locally without being rebroadcast by the adapter", () => {
  const { io, emitted } = recorder();
  relayDomainEvent(io, eventsChannel, "{}");
  relayDomainEvent(io, siteConfigChannel, '{"club_name":"Test club"}');
  assert.deepEqual(emitted, [["events:changed"], ["site-config:updated", { club_name: "Test club" }]]);
});

test("malformed config is rejected and unknown channels are ignored", () => {
  const { io, emitted } = recorder();
  assert.throws(() => relayDomainEvent(io, siteConfigChannel, "not-json"), SyntaxError);
  relayDomainEvent(io, "unrelated", "{}");
  assert.deepEqual(emitted, []);
});
