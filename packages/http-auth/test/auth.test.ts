import { SessionInvalidError } from "@danielsharp/auth";
import { BadRequest, Unauthorized, type HttpContext, type HttpMetadata } from "@danielsharp/typeline-http";
import { describe, expect, it, vi } from "vitest";

import { authentication, authErrorMapper, AuthenticationRequired } from "../src/auth";
import { MalformedBearerHeader } from "../src/bearer";

const metadata = {
  securitySchemes: { session: { scheme: "cookie", cookieName: "session" } },
} satisfies HttpMetadata;
const context = {} as HttpContext;

describe("authentication", () => {
  it("verifies provided credentials for required authentication", async () => {
    const read = vi.fn(() => "session-id");
    const verify = vi.fn(async (sessionId: string) => ({ userId: `user:${sessionId}` }));
    const middleware = authentication({
      scheme: { metadata, read: () => read },
      sessionProvider: { verify },
    }).required();

    await expect(middleware.mw({ retained: true }, context)).resolves.toEqual({
      retained: true,
      auth: { userId: "user:session-id" },
    });
    expect(verify).toHaveBeenCalledWith("session-id");
    expect(middleware.metadata).toEqual({ ...metadata, optionalSecurity: false });
  });

  it("rejects missing required credentials without calling verify", async () => {
    const verify = vi.fn();
    const middleware = authentication({
      scheme: { metadata, read: () => () => undefined },
      sessionProvider: { verify },
    }).required();

    await expect(middleware.mw({}, context)).rejects.toBeInstanceOf(AuthenticationRequired);
    expect(verify).not.toHaveBeenCalled();
  });

  it("adds explicit undefined for missing optional credentials", async () => {
    const verify = vi.fn();
    const middleware = authentication({
      scheme: { metadata, read: () => () => undefined },
      sessionProvider: { verify },
    }).optional();

    const result = await middleware.mw({ retained: true }, context);

    expect(result).toEqual({ retained: true, auth: undefined });
    expect(Object.hasOwn(result, "auth")).toBe(true);
    expect(verify).not.toHaveBeenCalled();
    expect(middleware.metadata).toEqual({ ...metadata, optionalSecurity: true });
  });

  it("verifies provided optional credentials and preserves provider failures", async () => {
    const invalid = new SessionInvalidError();
    const verify = vi.fn().mockRejectedValue(invalid);
    const middleware = authentication({
      scheme: { metadata, read: () => () => "expired-session" },
      sessionProvider: { verify },
    }).optional();

    await expect(middleware.mw({}, context)).rejects.toBe(invalid);
  });
});

describe("authErrorMapper", () => {
  it("maps malformed headers to 400 and authentication failures to 401", () => {
    expect(authErrorMapper(new MalformedBearerHeader())).toBeInstanceOf(BadRequest);
    expect(authErrorMapper(new AuthenticationRequired())).toBeInstanceOf(Unauthorized);
    expect(authErrorMapper(new SessionInvalidError())).toBeInstanceOf(Unauthorized);
  });

  it("leaves unrelated errors unmapped", () => {
    expect(authErrorMapper(new Error("unrelated"))).toBeUndefined();
  });
});
