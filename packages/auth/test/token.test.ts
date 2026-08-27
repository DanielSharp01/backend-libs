import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { issuePkce } from "../src/oauth";
import { hashToken, issueOpaqueToken, tokenSecondsUntil } from "../src/token";

describe("opaque tokens", () => {
  it("creates distinct 256-bit tokens", () => {
    const first = issueOpaqueToken();
    const second = issueOpaqueToken();

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });

  it("hashes tokens deterministically", () => {
    expect(hashToken("token")).toBe("3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0");
  });

  it("returns whole seconds until expiry", () => {
    expect(tokenSecondsUntil(7_001, 1_001)).toBe(6);
    expect(tokenSecondsUntil(new Date(2_001), 1_001)).toBe(1);
    expect(tokenSecondsUntil(1_000, 1_001)).toBe(0);
  });
});

describe("PKCE", () => {
  it("creates distinct verifier and S256 challenge pairs", () => {
    const first = issuePkce();
    const second = issuePkce();

    expect(first.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.codeChallenge).toBe(crypto.createHash("sha256").update(first.codeVerifier).digest("base64url"));
    expect(first).not.toEqual(second);
  });
});
