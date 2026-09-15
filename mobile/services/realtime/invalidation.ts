import type { QueryClient } from "@tanstack/react-query";
import type { RealtimeSocket } from "./socket";

export function subscribeToRealtime(
  socket: RealtimeSocket,
  queryClient: QueryClient,
  isSignedIn: () => boolean,
) {
  const eventsChanged = () => {
    void queryClient.invalidateQueries({ queryKey: ["events"] });
    void queryClient.invalidateQueries({ queryKey: ["event"] });
  };
  const registrationsChanged = () => {
    if (!isSignedIn()) return;
    void queryClient.invalidateQueries({ queryKey: ["registrations"] });
    void queryClient.invalidateQueries({ queryKey: ["registration"] });
    void queryClient.invalidateQueries({ queryKey: ["live-activities"] });
  };
  const connected = () => {
    // Notifications sent while disconnected cannot be replayed by this socket.
    eventsChanged();
    registrationsChanged();
  };
  socket.on("events:changed", eventsChanged);
  socket.on("registrations:changed", registrationsChanged);
  socket.on("connect", connected);
  return () => {
    socket.off("events:changed", eventsChanged);
    socket.off("registrations:changed", registrationsChanged);
    socket.off("connect", connected);
  };
}
