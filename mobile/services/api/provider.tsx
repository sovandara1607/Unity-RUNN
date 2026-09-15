import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import * as Network from "expo-network";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { createTransport, ApiError } from "./client";
import { Session } from "../auth/session";
import { tokenStorage } from "../storage/tokens";
import { readConfig } from "../../constants/config";
import { createRealtimeSocket } from "../realtime/socket";
import { subscribeToRealtime } from "../realtime/invalidation";
function createRuntime(config: ReturnType<typeof readConfig>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30000,
        retry: (count, error) =>
          count < 1 &&
          error instanceof ApiError &&
          (error.status === 0 || error.status >= 500) &&
          error.code !== "cancelled",
      },
      mutations: { retry: false },
    },
  });
  const request = createTransport(config.apiOrigin);
  const session = new Session(request, tokenStorage(config.apiOrigin), () => {
    void queryClient.cancelQueries();
    queryClient.clear();
  });
  return { ...config, queryClient, request, session };
}
const RuntimeContext = createContext<ReturnType<typeof createRuntime> | null>(
  null,
);
export function ApiProvider({
  children,
  config,
}: PropsWithChildren<{ config: ReturnType<typeof readConfig> }>) {
  const [runtime] = useState(() => createRuntime(config));
  useEffect(() => {
    void runtime.session.restore();
    const network = (state: Network.NetworkState) =>
      onlineManager.setOnline(
        state.isConnected !== false && state.isInternetReachable !== false,
      );
    void Network.getNetworkStateAsync()
      .then(network)
      .catch(() => undefined);
    const connection = Network.addNetworkStateListener(network);

    const socket = createRealtimeSocket(runtime.realtimeOrigin);
    const unsubscribe = socket
      ? subscribeToRealtime(socket, runtime.queryClient, () => Boolean(runtime.session.snapshot().user))
      : undefined;
    if (AppState.currentState === "active") socket?.connect();

    const app = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      if (Platform.OS !== "web") focusManager.setFocused(active);
      // Don't hold a live socket open while backgrounded -- reconnect picks
      // up right where the pull-based refresh above already would.
      if (active) socket?.connect();
      else socket?.disconnect();
    });
    return () => {
      connection.remove();
      app.remove();
      unsubscribe?.();
      socket?.disconnect();
    };
  }, [runtime]);
  return (
    <RuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={runtime.queryClient}>
        {children}
      </QueryClientProvider>
    </RuntimeContext.Provider>
  );
}
export function useApi() {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error("ApiProvider is required");
  return value;
}
export function useSession() {
  const { session } = useApi();
  return useSyncExternalStore(
    session.subscribe,
    session.snapshot,
    session.snapshot,
  );
}
export function useOnline() {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
}
