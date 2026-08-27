import { HeaderFormatError, type HttpContext, type HttpRequest, type HttpResponse } from "@danielsharp/typeline-http";
import { describe, expect, it, vi } from "vitest";

import { cookieScheme } from "../src/cookie";

describe("cookieScheme", () => {
  it("is security metadata and reads its validated cookie", async () => {
    const scheme = cookieScheme("session");

    expect(scheme.metadata).toEqual({
      securitySchemes: { session: { scheme: "cookie", cookieName: "session" } },
    });
    await expect(scheme.read(context({ unrelated: "value", session: "abc+123" }))).resolves.toBe("abc+123");
  });

  it("leaves missing credentials for auth to decide", async () => {
    await expect(cookieScheme("session").read(context())).resolves.toBeUndefined();
  });

  it("keeps cookie parsing errors distinct from missing credentials", async () => {
    const malformed = new HeaderFormatError("cookie", new TypeError("malformed"));
    await expect(
      cookieScheme("session").read(
        context(() => {
          throw malformed;
        }),
      ),
    ).rejects.toBe(malformed);
  });

  it("sets the cookie with the issued absolute expiry", () => {
    const expiresAt = new Date("2026-01-02T00:00:00.000Z");
    const response = responseSpies();
    const request = context({}, response.res);
    const input = { retained: true, sessionId: "session-id", expiresAt };
    const set = cookieScheme("session", {
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: true,
    }).set;

    expect(set(input, request)).toBe(input);
    expect(response.cookie).toHaveBeenCalledWith("session", "session-id", {
      expires: expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: true,
    });
  });

  it("clears the cookie with only matching scope options", () => {
    const response = responseSpies();
    const request = context({}, response.res);
    const input = { retained: true };
    const clear = cookieScheme("session", {
      domain: "example.com",
      httpOnly: true,
      partitioned: true,
      path: "/api",
      sameSite: "strict",
      secure: true,
    }).clear;

    expect(clear(input, request)).toBe(input);
    expect(response.clearCookie).toHaveBeenCalledWith("session", {
      domain: "example.com",
      partitioned: true,
      path: "/api",
      secure: true,
    });
  });
});

function context(
  cookies: Record<string, string> | (() => Record<string, string>) = {},
  res = responseSpies().res,
): HttpContext {
  const readCookies = typeof cookies === "function" ? cookies : () => cookies;
  return { req: { readCookies } as HttpRequest, res };
}

function responseSpies() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  return { cookie, clearCookie, res: { cookie, clearCookie } as unknown as HttpResponse };
}
