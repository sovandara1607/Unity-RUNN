import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { subscribeToRealtime } from "../services/realtime/invalidation";
import { createRealtimeSocket, type RealtimeSocket } from "../services/realtime/socket";

function setup() {
  const emitter = new EventEmitter();
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  for (const key of ["events", "event", "registrations", "registration", "live-activities"])
    queryClient.setQueryData([key, "test"], { loaded: true });
  return { emitter, socket: emitter as unknown as RealtimeSocket, queryClient };
}

test("reconnect invalidates fresh caches to recover missed updates", () => {
  const { emitter, socket, queryClient } = setup();
  const cleanup = subscribeToRealtime(socket, queryClient, () => true);
  emitter.emit("connect");
  for (const key of ["events", "event", "registrations", "registration", "live-activities"])
    assert.equal(queryClient.getQueryState([key, "test"])?.isInvalidated, true, key);
  cleanup();
  queryClient.clear();
});

test("public registration notifications need no payload and use the current login state", () => {
  const { emitter, socket, queryClient } = setup();
  let signedIn = false;
  const cleanup = subscribeToRealtime(socket, queryClient, () => signedIn);
  emitter.emit("registrations:changed");
  assert.equal(queryClient.getQueryState(["registrations", "test"])?.isInvalidated, false);
  signedIn = true;
  emitter.emit("registrations:changed");
  assert.equal(queryClient.getQueryState(["registrations", "test"])?.isInvalidated, true);
  cleanup();
  queryClient.clear();
});

test("provider remount removes its old listeners", () => {
  const { emitter, socket, queryClient } = setup();
  subscribeToRealtime(socket, queryClient, () => true)();
  const cleanup = subscribeToRealtime(socket, queryClient, () => true);
  for (const event of ["connect", "events:changed", "registrations:changed"])
    assert.equal(emitter.listenerCount(event), 1);
  cleanup();
  assert.equal(emitter.eventNames().length, 0);
  queryClient.clear();
});

test("separate provider lifetimes do not reuse a socket configured for another origin", () => {
  assert.equal(createRealtimeSocket(undefined), null);
  const first = createRealtimeSocket("http://localhost:4101")!;
  const second = createRealtimeSocket("http://localhost:4102")!;
  assert.notEqual(first, second);
  assert.notEqual(first.io, second.io);
  assert.equal(first.connected, false);
  assert.equal(second.connected, false);
  first.disconnect();
  second.disconnect();
});
