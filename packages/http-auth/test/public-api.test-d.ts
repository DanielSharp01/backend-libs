import { expectTypeOf } from "vitest";

import type { OAuthProvider } from "@danielsharp/auth";
import { flashCookie, router, type HttpContext, type HttpMetadata } from "@danielsharp/typeline-http";
import { z } from "zod";

import {
  authentication,
  authErrorMapper,
  AuthenticationRequired,
  bearerTokenScheme,
  cookieScheme,
  MalformedBearerHeader,
  oauthCallback,
} from "../src/index";

const cookie = cookieScheme("session", { httpOnly: true, path: "/", secure: true });
const bearer = bearerTokenScheme("accessToken", { bearerFormat: "JWT" });
const app = router();

app.use(cookie);
app.use(bearer);

const auth = authentication({
  scheme: cookie,
  sessionProvider: {
    verify(sessionId: string) {
      return { userId: sessionId };
    },
  },
});

app.get("/required", (line) =>
  line
    .pipe((input: {}) => ({ ...input, retained: true as const }))
    .pipe(auth.required())
    .pipe((input) => {
      expectTypeOf(input.retained).toEqualTypeOf<true>();
      expectTypeOf(input.auth).toEqualTypeOf<{ userId: string }>();
      return input;
    }),
);

declare const google: OAuthProvider<{ sub: string }>;
const pkceCookie = flashCookie(
  "pkce",
  z
    .string()
    .transform((value) => JSON.parse(value) as unknown)
    .pipe(z.object({ codeVerifier: z.string(), nonce: z.string() })),
  { maxAge: 300_000 },
);

app.get("/callback", (line) =>
  line
    .pipe((input: {}) => ({ ...input, retained: true as const }))
    .pipe(pkceCookie.take("pkce"))
    .pipe(oauthCallback({ provider: google, redirectUri: "https://api.example/callback" }))
    .pipe((input) => {
      expectTypeOf(input.retained).toEqualTypeOf<true>();
      expectTypeOf(input.identity).toEqualTypeOf<{ sub: string }>();
      expectTypeOf(input.state).toEqualTypeOf<string>();
      return input;
    }),
);

app.get("/optional", (line) =>
  line.pipe(auth.optional()).pipe((input) => {
    expectTypeOf(input.auth).toEqualTypeOf<{ userId: string } | undefined>();
    return input;
  }),
);

declare const context: HttpContext;
expectTypeOf(cookie.read(context)).toEqualTypeOf<Promise<string | undefined>>();
expectTypeOf(bearer.read(context)).toEqualTypeOf<Promise<string | undefined>>();
expectTypeOf(cookie.set({ sessionId: "session-id", expiresAt: new Date() }, context)).toEqualTypeOf<void>();
expectTypeOf(cookie.clear(context)).toEqualTypeOf<void>();
expectTypeOf(cookie.metadata).toMatchTypeOf<HttpMetadata>();
expectTypeOf(bearer.metadata).toMatchTypeOf<HttpMetadata>();
expectTypeOf(authErrorMapper).returns.toEqualTypeOf<import("@danielsharp/typeline-http").HttpError | undefined>();
expectTypeOf(AuthenticationRequired.is).toBeFunction();
expectTypeOf(MalformedBearerHeader.is).toBeFunction();

// @ts-expect-error Session verification always receives a string credential.
authentication({ scheme: cookie, sessionProvider: { verify(sessionId: number) {} } });
