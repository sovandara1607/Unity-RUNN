import { ApiError, type RequestOptions } from "../api/client";
import type { SessionResponse, User } from "../api/types";
export type TokenStorage = {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
};
type Transport = <T>(path: string, options?: RequestOptions) => Promise<T>;
export type SessionState = {
  status: "loading" | "guest" | "authenticated" | "unavailable";
  user: User | null;
  message?: string;
};

export class Session {
  private accessToken = "";
  private state: SessionState = { status: "loading", user: null };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private refreshFlight: Promise<void> | null = null;
  private restoreFlight: Promise<void> | null = null;
  private identityVersion = 0;
  constructor(
    private transport: Transport,
    private storage: TokenStorage,
    private clearCache: () => void,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(next: SessionState) {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(operation, operation);
    this.queue = pending.catch(() => undefined);
    return pending;
  }
  private async accept(result: SessionResponse) {
    if (!result.access_token || !result.refresh_token || !result.user?.id)
      throw new ApiError(
        "The service did not return a native session.",
        0,
        "invalid_response",
      );
    // Persist the replacement before exposing the access token to new requests.
    await this.storage.set(result.refresh_token);
    this.accessToken = result.access_token;
    this.emit({ status: "authenticated", user: result.user });
  }
  private async forget() {
    this.accessToken = "";
    this.identityVersion++;
    this.clearCache();
    try {
      await this.storage.remove();
    } catch {
      this.emit({
        status: "unavailable",
        user: null,
        message: "Could not clear the saved session. Try signing out again.",
      });
      throw new ApiError(
        "Could not clear the saved session.",
        0,
        "storage_error",
      );
    }
    this.emit({ status: "guest", user: null });
  }
  authenticate(
    kind: "login" | "register",
    credentials: { email: string; password: string; full_name?: string },
  ) {
    return this.serialize(() =>
      this.establish(`/api/v1/auth/mobile/${kind}`, credentials),
    );
  }
  /** code is the one-time handoff code from GoogleSignInButton's deep-link callback — the
   * browser-based flow already completed sign-in with Google server-side; this just redeems
   * that code for the bearer session. */
  loginWithGoogle(code: string) {
    return this.serialize(() =>
      this.establish("/api/v1/auth/mobile/google/callback", { code }),
    );
  }
  private async establish(path: string, body: unknown) {
    const result = await this.transport<SessionResponse>(path, {
      method: "POST",
      body,
    });
    this.identityVersion++;
    this.clearCache();
    try {
      await this.accept(result);
    } catch (error) {
      // A storage failure must not leave a usable but unpersisted session behind.
      await this.transport("/api/v1/auth/mobile/logout", {
        method: "POST",
        body: { refresh_token: result.refresh_token },
      }).catch(() => undefined);
      await this.forget();
      throw error;
    }
  }
  private async rotate() {
    const token = await this.storage.get();
    if (!token) {
      await this.forget();
      throw new ApiError("Sign in to continue.", 401, "unauthorized");
    }
    let result: SessionResponse;
    try {
      result = await this.transport<SessionResponse>(
        "/api/v1/auth/mobile/refresh",
        { method: "POST", body: { refresh_token: token } },
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        await this.forget();
      // A timeout or provider outage must not erase a potentially valid session.
      throw error;
    }
    try {
      await this.accept(result);
    } catch (error) {
      await this.transport("/api/v1/auth/mobile/logout", {
        method: "POST",
        body: { refresh_token: result.refresh_token },
      }).catch(() => undefined);
      await this.forget();
      throw error;
    }
  }
  refresh() {
    if (!this.refreshFlight)
      this.refreshFlight = this.serialize(() => this.rotate()).finally(() => {
        this.refreshFlight = null;
      });
    return this.refreshFlight;
  }
  restore() {
    if (!this.restoreFlight)
      this.restoreFlight = this.refresh()
        .catch((error) => {
          if (this.state.status !== "guest")
            this.emit({
              status: "unavailable",
              user: null,
              message:
                error instanceof Error
                  ? error.message
                  : "Could not restore your session.",
            });
        })
        .finally(() => {
          this.restoreFlight = null;
        });
    return this.restoreFlight;
  }
  logout() {
    // Serialized after rotation so revocation targets the freshest token.
    return this.serialize(async () => {
      let failure: unknown;
      try {
        const token = await this.storage.get();
        if (token)
          await this.transport("/api/v1/auth/mobile/logout", {
            method: "POST",
            body: { refresh_token: token },
          });
      } catch (error) {
        failure = error;
      }
      await this.forget();
      if (failure)
        throw new ApiError(
          "Signed out on this device. The server could not confirm session revocation; reconnect and sign in again if needed.",
          0,
          "logout_unconfirmed",
        );
    });
  }
  async request<T>(
    path: string,
    options: Omit<RequestOptions, "token"> = {},
  ): Promise<T> {
    if (this.state.status === "loading") await this.restore();
    if (!this.accessToken) await this.refresh();
    const version = this.identityVersion;
    const initialToken = this.accessToken;
    const send = () =>
      this.transport<T>(path, { ...options, token: this.accessToken });
    try {
      const result = await send();
      if (version !== this.identityVersion)
        throw new ApiError("Session changed.", 401, "session_changed");
      return result;
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        version !== this.identityVersion
      )
        throw error;
      // A late 401 may refer to the old access token, after another request rotated it.
      if (this.accessToken === initialToken) await this.refresh();
      if (version !== this.identityVersion)
        throw new ApiError("Session changed.", 401, "session_changed");
      try {
        const result = await send();
        if (version !== this.identityVersion)
          throw new ApiError("Session changed.", 401, "session_changed");
        return result;
      } catch (retryError) {
        if (
          retryError instanceof ApiError &&
          retryError.status === 401 &&
          version === this.identityVersion
        )
          await this.serialize(async () => {
            if (version === this.identityVersion) await this.forget();
          });
        throw retryError;
      }
    }
  }
}
