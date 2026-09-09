export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = "network_error",
  ) {
    super(message);
  }
}
export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
};
export function createTransport(
  origin: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15000,
) {
  return async function request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    if (!path.startsWith("/api/v1/"))
      throw new ApiError("Invalid API path.", 0, "configuration");
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetcher(`${origin}${path}`, {
        method: options.method ?? "GET",
        credentials: "omit",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(options.token
            ? { Authorization: `Bearer ${options.token}` }
            : {}),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      if (response.status === 204) return undefined as T;
      let payload: any;
      try {
        payload = await response.json();
      } catch {
        /* Gateways may return HTML or plain text. */
      }
      if (!response.ok)
        throw new ApiError(
          payload?.error?.message ??
            `The service returned ${response.status}. Please try again.`,
          response.status,
          payload?.error?.code ?? "http_error",
        );
      if (!payload || !Object.prototype.hasOwnProperty.call(payload, "data"))
        throw new ApiError(
          "The service returned an unexpected response.",
          response.status,
          "invalid_response",
        );
      return payload.data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted)
        throw new ApiError("Request cancelled.", 0, "cancelled");
      if (controller.signal.aborted)
        throw new ApiError(
          "The connection took too long. Please try again.",
          0,
          "timeout",
        );
      throw new ApiError(
        "Could not connect. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  };
}
