type TokenSource = {
  addPushTokenListener(listener: (event: { pushToken: string }) => void): { remove(): void };
  getPushToken(): Promise<string | null>;
};

// Tokens are optional: simulator and notification failures must not strand an activity.
export function awaitPushToken(source: TokenSource, timeoutMs = 4000): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    let subscription: { remove(): void } | undefined;
    const timer = setTimeout(() => finish(""), timeoutMs);
    function removeListener() {
      try {
        subscription?.remove();
      } catch {
        // Native listener cleanup must not prevent start() from completing.
      }
      subscription = undefined;
    }
    function finish(token: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeListener();
      resolve(token);
    }
    try {
      subscription = source.addPushTokenListener(({ pushToken }) => {
        if (pushToken) finish(pushToken);
      });
      // A source may deliver its cached token while subscribing.
      if (settled) removeListener();
    } catch {
      // The getter may still provide a token when subscriptions are unavailable.
    }
    if (!settled) {
      void Promise.resolve().then(() => source.getPushToken()).then((token) => {
        if (token) finish(token);
      }).catch(() => undefined);
    }
  });
}
