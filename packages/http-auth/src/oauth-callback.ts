import { OAuthDeniedError, OAuthError, type OAuthProvider } from "@danielsharp/auth";
import type { Merge } from "@danielsharp/common";
import { resRedirect, validateQuery, type HttpContext, type HttpMetadata } from "@danielsharp/typeline-http";
import { z } from "zod";

/** What the authorize step kept for the callback, usually in a flash cookie. */
export interface OAuthCallbackPkce {
  codeVerifier: string;
  nonce?: string;
}

export interface OAuthCallbackOptions<TIdentity> {
  provider: OAuthProvider<TIdentity>;
  redirectUri: string;
  /** Sends OAuth failures here with `?error=oauth_denied` or `?error=oauth_error` instead of throwing. */
  onError?: { redirect: string };
}

// Providers often send `access_denied` without a description.
const callbackQuery = z.union([
  z.object({ code: z.string(), state: z.string() }),
  z.object({ error: z.string(), error_description: z.string().optional() }),
]);

/**
 * Turns the provider's redirect back into an identity. Reads the PKCE verifier and nonce from
 * `input.pkce`, and adds `identity` and the `state` given to the authorization URL.
 */
export function oauthCallback<TIdentity, TInput extends { pkce: OAuthCallbackPkce }>({
  provider,
  redirectUri,
  onError,
}: OAuthCallbackOptions<TIdentity>) {
  const query = validateQuery(callbackQuery);
  const redirect = resRedirect(302);

  return {
    metadata: (onError ? { ...query.metadata, ...redirect.metadata } : query.metadata) satisfies HttpMetadata,
    async mw(input: TInput, context: HttpContext): Promise<Merge<TInput, { identity: TIdentity; state: string }>> {
      const { query: callback } = await query.mw({}, context);
      try {
        if ("error" in callback) {
          throw callback.error === "access_denied" ? new OAuthDeniedError() : new OAuthError(callback);
        }
        const identity = await provider.getIdentity({
          code: callback.code,
          redirectUri,
          codeVerifier: input.pkce.codeVerifier,
          ...(input.pkce.nonce === undefined ? {} : { nonce: input.pkce.nonce }),
        });
        return { ...input, identity, state: callback.state } as Merge<TInput, { identity: TIdentity; state: string }>;
      } catch (error) {
        if (onError && (OAuthError.is(error) || OAuthDeniedError.is(error))) {
          return redirect.mw(withError(onError.redirect, error.code.toLowerCase()), context);
        }
        throw error;
      }
    },
  };
}

function withError(location: string, code: string): string {
  return `${location}${location.includes("?") ? "&" : "?"}error=${code}`;
}
