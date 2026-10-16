import crypto from "node:crypto";

export function issueOpaqueToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function tokenSecondsUntil(expiresAt: Date | number, now = Date.now()) {
  const expiresAtMs = expiresAt instanceof Date ? expiresAt.getTime() : expiresAt;
  return Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
}

export function issueExpiringToken(expiresInMs: number, now = Date.now()) {
  const token = issueOpaqueToken();
  return { token, idHash: hashToken(token), expiresAt: new Date(now + expiresInMs) };
}
