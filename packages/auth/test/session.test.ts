import { describe, expect, it, vi } from "vitest";

import { SessionInvalidError } from "../src/errors";
import { sessionProvider, type SessionStore } from "../src/session";
import { hashToken } from "../src/token";

type Session = { userId: string };

function createStore(now: () => number = Date.now) {
  const sessions = new Map<string, { session: Session; expiresAt: Date }>();

  const store: SessionStore<Session> = {
    setSession: vi.fn((idHash, session, expiresAt) => {
      sessions.set(idHash, { session, expiresAt });
    }),
    getSession: vi.fn((idHash) => {
      const stored = sessions.get(idHash);
      if (!stored || stored.expiresAt.getTime() <= now()) return null;
      return stored.session;
    }),
    deleteSession: vi.fn((idHash) => {
      sessions.delete(idHash);
    }),
  };

  return store;
}

describe("sessionProvider", () => {
  it("issues and verifies an opaque session id", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const store = createStore(() => now);
    const provider = sessionProvider(store, { expiresInMs: 60_000, now: () => now });
    const session = { userId: "user-1" };

    const issued = await provider.issue(session);

    expect(issued.sessionId).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.expiresAt).toEqual(new Date(now + 60_000));
    expect(store.setSession).toHaveBeenCalledWith(
      hashToken(issued.sessionId),
      session,
      issued.expiresAt,
    );
    await expect(provider.verify(issued.sessionId)).resolves.toEqual(session);
  });

  it("rejects an unknown session id", async () => {
    const provider = sessionProvider(createStore(), { expiresInMs: 60_000 });

    await expect(provider.verify("unknown-session")).rejects.toBeInstanceOf(SessionInvalidError);
  });

  it("relies on the store to reject expired sessions", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const store = createStore(() => now);
    const provider = sessionProvider(store, { expiresInMs: 60_000, now: () => now });
    const issued = await provider.issue({ userId: "user-1" });

    now = issued.expiresAt.getTime();

    await expect(provider.verify(issued.sessionId)).rejects.toBeInstanceOf(SessionInvalidError);
  });

  it("revokes the hashed session id", async () => {
    const store = createStore();
    const provider = sessionProvider(store, { expiresInMs: 60_000 });
    const issued = await provider.issue({ userId: "user-1" });

    await provider.revoke(issued.sessionId);

    expect(store.deleteSession).toHaveBeenCalledWith(hashToken(issued.sessionId));
    await expect(provider.verify(issued.sessionId)).rejects.toBeInstanceOf(SessionInvalidError);
  });

  it("requires a positive finite expiry", () => {
    const store = createStore();

    expect(() => sessionProvider(store, { expiresInMs: 0 })).toThrow(TypeError);
    expect(() => sessionProvider(store, { expiresInMs: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });
});
