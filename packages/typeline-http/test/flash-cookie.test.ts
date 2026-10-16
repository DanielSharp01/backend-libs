import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";

import { typeline } from "@danielsharp/typeline";

import { HttpValidationError } from "../src/errors";
import { flashCookie } from "../src/flash-cookie";
import type { HttpMetadata } from "../src/metadata";
import type { HttpRequest } from "../src/request";
import type { HttpResponse } from "../src/response";
import type { HttpContext } from "../src/router";

const options = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 15 * 60 * 1000 } as const;
const invite = flashCookie("__Host-invite", z.string().max(10).optional().catch(undefined), options);
const pkce = flashCookie(
  "__Host-pkce",
  z
    .string()
    .transform((value) => JSON.parse(value) as unknown)
    .pipe(z.object({ codeVerifier: z.string() })),
  options,
);

describe("flashCookie", () => {
  it("sets the value with the cookie's options", () => {
    const { context, res } = request({});
    invite.set("token", context);
    expect(res.cookie).toHaveBeenCalledWith("__Host-invite", "token", options);
  });

  it("takes the value into the input under the given key and clears the cookie", async () => {
    const { context, res } = request({ "__Host-invite": "token" });
    const output = await typeline<{ kept: number }, { kept: number }, HttpContext, HttpMetadata>()
      .pipe(invite.take("invite"))
      .push({ kept: 1 }, context);

    expect(output).toEqual({ kept: 1, invite: "token" });
    expectTypeOf(output.invite).toEqualTypeOf<string | undefined>();
    expectTypeOf(output.kept).toEqualTypeOf<number>();
    expect(res.clearCookie).toHaveBeenCalledWith("__Host-invite", { path: "/", secure: true });
  });

  it("lets the schema treat a missing or malformed value as absent", async () => {
    for (const cookies of [{}, { "__Host-invite": "far too long for the schema" }]) {
      const { context } = request(cookies);
      expect(await invite.take("invite").mw({}, context)).toEqual({ invite: undefined });
    }
  });

  it("fails validation for a required cookie and still clears it", async () => {
    const { context, res } = request({});
    await expect(pkce.take("pkce").mw({}, context)).rejects.toBeInstanceOf(HttpValidationError);
    expect(res.clearCookie).toHaveBeenCalledWith("__Host-pkce", { path: "/", secure: true });
  });

  it("documents the cookie it reads", () => {
    expect(Object.keys(invite.take("invite").metadata)).toEqual(["cookies"]);
  });
});

function request(cookies: Record<string, string>) {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  const req = { readCookies: () => cookies } as unknown as HttpRequest;
  return { context: { req, res: res as unknown as HttpResponse } as HttpContext, res };
}
