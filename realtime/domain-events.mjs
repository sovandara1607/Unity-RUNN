export const siteConfigChannel = "unity:realtime:site-config";
export const eventsChannel = "unity:realtime:events";
export const registrationsChannel = "unity:realtime:registrations";

export function relayDomainEvent(io, channel, rawPayload) {
  // Redis delivers to every server already. The adapter would broadcast it again.
  switch (channel) {
    case siteConfigChannel:
      io.local.emit("site-config:updated", JSON.parse(rawPayload));
      break;
    case eventsChannel:
      io.local.emit("events:changed");
      break;
    case registrationsChannel:
      // Strip identifiers even when an older API replica publishes them.
      io.local.emit("registrations:changed", {});
      break;
  }
}
