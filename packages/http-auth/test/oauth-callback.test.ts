import { OAuthDeniedError, OAuthError, type OAuthProvider, type OAuthRequest } from "@danielsharp/auth";
import type { HttpContext, HttpQuery } from "@danielsharp/typeline-http";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { oauthCallback } from "../src/oauth-callback";

type Identity = { sub: string };

// http-auth doesn't depend on typeline; this is the signal its stop() throws, registered globally.
const pipelineStop = Symbol.for("@danielsharp/typeline/stop");

function provider(getIdentity: (request: OAuthRequest) => Promise<Identity> = async () => ({ sub: "user-1" })) {
  return { getAuthorizationUrl: vi.fn(), getIdentity: vi.fn(getIdentity) } satisfies OAuthProvider<Identity>;
}

function callback(query: HttpQuery) {
  const res = { redirect: vi.fn() };
  return { context: { req: { query }, res } as unknown as HttpContext, res };
}

const pkce = { codeVerifier: "verifier", nonce: "nonce" };
const redirectUri = "https://api.example/auth/google/callback";

describe("oauthCallback", () => {
  it("exchanges the code with the stashed verifier and nonce and adds identity and state", async () => {
    const google = provider();
    const { context } = callback({ code: "code", state: "/capture/" });

    const step = oauthCallback<Identity, { pkce: typeof pkce; kept: number }>({ provider: google, redirectUri });
    const output = await step.mw({ pkce, kept: 1 }, context);

    expect(output).toEqual({ pkce, kept: 1, identity: { sub: "user-1" }, state: "/capture/" });
    expectTypeOf(output.identity).toEqualTypeOf<Identity>();
    expectTypeOf(output.state).toEqualTypeOf<string>();
    expect(google.getIdentity).toHaveBeenCalledWith({ code: "code", redirectUri, codeVerifier: "verifier", nonce: "nonce" });
  });

  it("throws OAuthDeniedError for access_denied, which often comes without a description", async () => {
    const { context } = callback({ error: "access_denied" });
    await expect(oauthCallback({ provider: provider(), redirectUri }).mw({ pkce }, context)).rejects.toBeInstanceOf(
      OAuthDeniedError,
    );
  });

  it("throws OAuthError for other provider errors and failed exchanges", async () => {
    const failing = provider(async () => {
      throw new OAuthError(new Error("bad code"));
    });
    for (const [query, google] of [
      [{ error: "server_error", error_description: "try later" }, provider()],
      [{ code: "code", state: "/" }, failing],
    ] as const) {
      const { context } = callback(query);
      await expect(oauthCallback({ provider: google, redirectUri }).mw({ pkce }, context)).rejects.toSatisfy(
        OAuthError.is,
      );
    }
  });

  it("redirects OAuth failures with their code when onError is set", async () => {
    for (const [query, location] of [
      [{ error: "access_denied" }, "/login?error=oauth_denied"],
      [{ error: "server_error" }, "/login?error=oauth_error"],
    ] as const) {
      const { context, res } = callback(query);
      const step = oauthCallback({ provider: provider(), redirectUri, onError: { redirect: "/login" } });

      await expect(step.mw({ pkce }, context)).rejects.toBe(pipelineStop);
      expect(res.redirect).toHaveBeenCalledWith(location, 302);
    }
  });

  it("appends the error to a redirect that already has a query", async () => {
    const { context, res } = callback({ error: "access_denied" });
    const step = oauthCallback({ provider: provider(), redirectUri, onError: { redirect: "/login?from=invite" } });

    await expect(step.mw({ pkce }, context)).rejects.toBe(pipelineStop);
    expect(res.redirect).toHaveBeenCalledWith("/login?from=invite&error=oauth_denied", 302);
  });

  it("lets errors that aren't OAuth failures through even with onError", async () => {
    const outage = new Error("database down");
    const { context, res } = callback({ code: "code", state: "/" });
    const step = oauthCallback({
      provider: provider(async () => {
        throw outage;
      }),
      redirectUri,
      onError: { redirect: "/login" },
    });

    await expect(step.mw({ pkce }, context)).rejects.toBe(outage);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("documents the callback query, and the redirect only when it can happen", () => {
    expect(Object.keys(oauthCallback({ provider: provider(), redirectUri }).metadata)).toEqual(["query"]);
    expect(oauthCallback({ provider: provider(), redirectUri, onError: { redirect: "/login" } }).metadata).toMatchObject({
      responses: [{ status: 302 }],
    });
  });
});
