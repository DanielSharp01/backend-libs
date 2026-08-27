import { expectTypeOf } from "vitest";

import {
  AuthError,
  OAuthError,
  SessionInvalidError,
  hashToken,
  issuePkce,
  issueOpaqueToken,
  sessionProvider,
  tokenSecondsUntil,
  type OAuthAuthorizationRequest,
  type OAuthProvider,
  type OAuthRequest,
  type Pkce,
  type SessionProvider,
  type SessionStore,
} from "../src/index";
import { googleOauth, type GoogleIdentity } from "../src/google";

expectTypeOf(hashToken).toBeFunction();
expectTypeOf(issuePkce).toBeFunction();
expectTypeOf(issueOpaqueToken).toBeFunction();
expectTypeOf(sessionProvider).toBeFunction();
expectTypeOf(tokenSecondsUntil).toBeFunction();
expectTypeOf(googleOauth).toBeFunction();
expectTypeOf(AuthError.is).toBeFunction();
expectTypeOf(OAuthError).toBeConstructibleWith(new Error());
expectTypeOf(SessionInvalidError).toBeConstructibleWith();

type Auth = { userId: string };
declare const store: SessionStore<Auth>;

expectTypeOf(sessionProvider(store, { expiresInMs: 60_000 })).toEqualTypeOf<SessionProvider<Auth>>();
expectTypeOf(hashToken("token")).toEqualTypeOf<string>();
expectTypeOf(issuePkce()).toEqualTypeOf<Pkce>();
expectTypeOf(issueOpaqueToken()).toEqualTypeOf<string>();
expectTypeOf(tokenSecondsUntil(new Date())).toEqualTypeOf<number>();

declare const oauthRequest: OAuthRequest;
declare const oauthAuthorizationRequest: OAuthAuthorizationRequest;
declare const oauthProvider: OAuthProvider<{ sub: string }>;
expectTypeOf<OAuthAuthorizationRequest>().toEqualTypeOf<{
  redirectUri: string;
  state: string;
  codeChallenge?: string;
  nonce?: string;
}>();
expectTypeOf<OAuthRequest>().toEqualTypeOf<{
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  nonce?: string;
}>();
expectTypeOf(oauthProvider.getAuthorizationUrl(oauthAuthorizationRequest)).toEqualTypeOf<string>();
expectTypeOf(oauthProvider.getIdentity(oauthRequest)).toEqualTypeOf<Promise<{ sub: string }>>();

const google = googleOauth({ clientId: "client-id", clientSecret: "client-secret" });
expectTypeOf(
  google.getAuthorizationUrl({
    redirectUri: "https://example.com/callback",
    state: "state",
    codeChallenge: "code-challenge",
    nonce: "nonce",
  }),
).toEqualTypeOf<string>();
expectTypeOf(google.getIdentity({ code: "code", redirectUri: "https://example.com/callback" })).toEqualTypeOf<
  Promise<{
    sub: string;
    email: string | undefined;
    emailVerified: boolean | undefined;
    hostedDomain: string | undefined;
    name: string | undefined;
    givenName: string | undefined;
    familyName: string | undefined;
    picture: string | undefined;
    locale: string | undefined;
  }>
>();
expectTypeOf(
  google.getIdentity({
    code: "code",
    redirectUri: "https://example.com/callback",
    codeVerifier: "code-verifier",
    nonce: "nonce",
  }),
).toEqualTypeOf<Promise<GoogleIdentity>>();

declare const error: unknown;
if (OAuthError.is(error)) {
  expectTypeOf(error).toEqualTypeOf<OAuthError>();
  expectTypeOf(error.code).toEqualTypeOf<"OAUTH_ERROR">();
}

if (SessionInvalidError.is(error)) {
  expectTypeOf(error).toEqualTypeOf<SessionInvalidError>();
  expectTypeOf(error.code).toEqualTypeOf<"SESSION_INVALID">();
}

// @ts-expect-error Google OAuth is available from the google entry point only.
type RootGoogleOauth = typeof import("../src/index").googleOauth;

// @ts-expect-error The removed auth orchestrator is application code now.
type RemovedAuthProvider = typeof import("../src/index").authProvider;
