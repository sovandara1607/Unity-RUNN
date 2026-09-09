import assert from "node:assert/strict";
import { test } from "node:test";
import { Session, type TokenStorage } from "../services/auth/session";
import { ApiError, type RequestOptions } from "../services/api/client";
const user = {
  id: "runner",
  email: "runner@example.com",
  role: "USER" as const,
};
const pair = (id: number) => ({
  access_token: `access-${id}`,
  refresh_token: `refresh-${id}`,
  user,
});
function storage(initial: string | null = null) {
  let token = initial;
  return {
    get: async () => token,
    set: async (value: string) => {
      token = value;
    },
    remove: async () => {
      token = null;
    },
  };
}
const adapt = (
  handler: (path: string, options?: RequestOptions) => Promise<any>,
) => handler as <T>(path: string, options?: RequestOptions) => Promise<T>;
const unauthorized = () => new ApiError("Expired", 401, "unauthorized");

test("concurrent 401s rotate once and each protected request retries once", async () => {
  let refreshes = 0;
  const attempts: string[] = [];
  const vault = storage();
  const session = new Session(
    adapt(async (path, options) => {
      if (path.endsWith("/login")) return pair(1);
      if (path.endsWith("/refresh")) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return pair(2);
      }
      attempts.push(options?.token ?? "");
      if (options?.token === "access-1") throw unauthorized();
      return { ok: true };
    }),
    vault,
    () => {},
  );
  await session.authenticate("login", {
    email: user.email,
    password: "password",
  });
  await Promise.all([
    session.request("/api/v1/me/"),
    session.request("/api/v1/me/"),
    session.request("/api/v1/me/"),
  ]);
  assert.equal(refreshes, 1);
  assert.equal(attempts.filter((token) => token === "access-1").length, 3);
  assert.equal(attempts.filter((token) => token === "access-2").length, 3);
  assert.equal(await vault.get(), "refresh-2");
});

test("invalid saved refresh clears storage and private cache", async () => {
  const vault = storage("revoked");
  let cleared = 0;
  const session = new Session(
    adapt(async () => {
      throw unauthorized();
    }),
    vault,
    () => {
      cleared++;
    },
  );
  await session.restore();
  assert.equal(session.snapshot().status, "guest");
  assert.equal(await vault.get(), null);
  assert.equal(cleared, 1);
});

test("offline restoration keeps refresh token and can recover", async () => {
  const vault = storage("refresh-1");
  let offline = true;
  const session = new Session(
    adapt(async () => {
      if (offline) throw new ApiError("Offline");
      return pair(2);
    }),
    vault,
    () => {},
  );
  await session.restore();
  assert.equal(session.snapshot().status, "unavailable");
  assert.equal(await vault.get(), "refresh-1");
  offline = false;
  await session.restore();
  assert.equal(session.snapshot().status, "authenticated");
  assert.equal(await vault.get(), "refresh-2");
});

test("logout waits for rotation and revokes the newest token", async () => {
  const vault = storage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let sent: unknown;
  const session = new Session(
    adapt(async (path, options) => {
      if (path.endsWith("/login")) return pair(1);
      if (path.endsWith("/refresh")) {
        await gate;
        return pair(2);
      }
      if (path.endsWith("/logout")) {
        sent = options?.body;
        return undefined;
      }
      throw Error("Unexpected request");
    }),
    vault,
    () => {},
  );
  await session.authenticate("login", {
    email: user.email,
    password: "password",
  });
  const refresh = session.refresh();
  const logout = session.logout();
  release();
  await Promise.all([refresh, logout]);
  assert.deepEqual(sent, { refresh_token: "refresh-2" });
  assert.equal(session.snapshot().status, "guest");
  assert.equal(await vault.get(), null);
});

test("failed remote logout still clears local secrets and reports unconfirmed revocation", async () => {
  const vault = storage("refresh-1");
  const session = new Session(
    adapt(async () => {
      throw new ApiError("Offline");
    }),
    vault,
    () => {},
  );
  await assert.rejects(
    session.logout(),
    (error: ApiError) => error.code === "logout_unconfirmed",
  );
  assert.equal(session.snapshot().status, "guest");
  assert.equal(await vault.get(), null);
});

test("secure persistence failure revokes the issued session", async () => {
  let revoked = false;
  const vault: TokenStorage = {
    get: async () => null,
    set: async () => {
      throw Error("Keychain locked");
    },
    remove: async () => {},
  };
  const session = new Session(
    adapt(async (path) => {
      if (path.endsWith("/logout")) {
        revoked = true;
        return;
      }
      return pair(1);
    }),
    vault,
    () => {},
  );
  await assert.rejects(
    session.authenticate("login", { email: user.email, password: "password" }),
  );
  assert.equal(revoked, true);
  assert.equal(session.snapshot().status, "guest");
});

test("a second 401 ends the session without an infinite refresh loop", async () => {
  let refreshes = 0;
  const session = new Session(
    adapt(async (path) => {
      if (path.endsWith("/login")) return pair(1);
      if (path.endsWith("/refresh")) {
        refreshes++;
        return pair(2);
      }
      throw unauthorized();
    }),
    storage(),
    () => {},
  );
  await session.authenticate("login", {
    email: user.email,
    password: "password",
  });
  await assert.rejects(session.request("/api/v1/me/"));
  assert.equal(refreshes, 1);
  assert.equal(session.snapshot().status, "guest");
});

test("a response arriving after logout cannot repopulate private state", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const session = new Session(
    adapt(async (path) => {
      if (path.endsWith("/login")) return pair(1);
      if (path.endsWith("/logout")) return;
      await gate;
      return { private: true };
    }),
    storage(),
    () => {},
  );
  await session.authenticate("login", {
    email: user.email,
    password: "password",
  });
  const request = session.request("/api/v1/me/");
  await session.logout();
  release();
  await assert.rejects(
    request,
    (error: ApiError) => error.code === "session_changed",
  );
});
