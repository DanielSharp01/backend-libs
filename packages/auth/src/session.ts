import type { Awaitable } from "@danielsharp/common";
import { SessionInvalidError } from "./errors";
import { hashToken, issueExpiringToken } from "./token";

export interface IssuedSession {
  sessionId: string;
  expiresAt: Date;
}

export interface SessionProvider<TSession> {
  issue(session: TSession): Promise<IssuedSession>;
  verify(sessionId: string): Promise<TSession>;
  revoke(sessionId: string): Promise<void>;
}

export interface SessionProviderOptions {
  expiresInMs: number;
  now?: () => number;
}

export function sessionProvider<TSession>(
  store: SessionStore<TSession>,
  { expiresInMs, now = Date.now }: SessionProviderOptions,
): SessionProvider<TSession> {
  if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
    throw new TypeError("Session expiry must be a positive number of milliseconds.");
  }

  return {
    async issue(session) {
      const { token: sessionId, idHash, expiresAt } = issueExpiringToken(expiresInMs, now());
      await store.setSession(idHash, session, expiresAt);
      return { sessionId, expiresAt };
    },
    async verify(sessionId) {
      const session = await store.getSession(hashToken(sessionId));
      if (!session) {
        throw new SessionInvalidError();
      }
      return session;
    },
    async revoke(sessionId) {
      await store.deleteSession(hashToken(sessionId));
    },
  };
}

export interface SessionStore<TSession> {
  setSession(idHash: string, session: TSession, expiresAt: Date): Awaitable<void>;
  getSession(idHash: string): Awaitable<TSession | null>;
  deleteSession(idHash: string): Awaitable<void>;
}
