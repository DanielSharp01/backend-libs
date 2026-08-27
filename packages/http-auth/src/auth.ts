import { SessionInvalidError } from "@danielsharp/auth";
import type { Awaitable, Merge } from "@danielsharp/common";
import {
  BadRequest,
  Unauthorized,
  type HttpContext,
  type HttpError,
  type HttpMetadata,
} from "@danielsharp/typeline-http";

import { MalformedBearerHeader } from "./bearer";

const AUTHENTICATION_REQUIRED = Symbol.for("@danielsharp/http-auth/authentication-required");

export class AuthenticationRequired extends Error {
  static readonly code = "AUTHENTICATION_REQUIRED";
  readonly code = AuthenticationRequired.code;
  readonly [AUTHENTICATION_REQUIRED] = true;

  constructor() {
    super("Authentication is required.");
    this.name = "AuthenticationRequired";
  }

  static is(error: unknown): error is AuthenticationRequired {
    return (
      typeof error === "object" &&
      error !== null &&
      AUTHENTICATION_REQUIRED in error &&
      error[AUTHENTICATION_REQUIRED] === true
    );
  }
}

export function authentication<TAuth>({
  scheme,
  sessionProvider,
}: {
  scheme: {
    metadata: HttpMetadata;
    read(context: HttpContext): Awaitable<string | undefined>;
  };
  sessionProvider: {
    verify(sessionId: string): Awaitable<TAuth>;
  };
}): {
  optional<TInput extends object>(): {
    metadata: HttpMetadata;
    mw(input: TInput, context: HttpContext): Promise<Merge<TInput, { auth: TAuth | undefined }>>;
  };
  required<TInput extends object>(): {
    metadata: HttpMetadata;
    mw(input: TInput, context: HttpContext): Promise<Merge<TInput, { auth: TAuth }>>;
  };
} {
  return {
    optional<TInput extends object>() {
      return {
        metadata: { ...scheme.metadata, optionalSecurity: true } satisfies HttpMetadata,
        async mw(input: TInput, context: HttpContext): Promise<Merge<TInput, { auth: TAuth | undefined }>> {
          const sessionId = await scheme.read(context);
          const verified = sessionId === undefined ? undefined : await sessionProvider.verify(sessionId);
          return { ...input, auth: verified };
        },
      };
    },
    required<TInput extends object>() {
      return {
        metadata: { ...scheme.metadata, optionalSecurity: false } satisfies HttpMetadata,
        async mw(input: TInput, context: HttpContext): Promise<Merge<TInput, { auth: TAuth }>> {
          const sessionId = await scheme.read(context);
          if (sessionId === undefined) throw new AuthenticationRequired();
          return { ...input, auth: await sessionProvider.verify(sessionId) };
        },
      };
    },
  };
}

export function authErrorMapper(error: unknown): HttpError | undefined {
  if (MalformedBearerHeader.is(error)) return new BadRequest({ header: "authorization" });
  if (AuthenticationRequired.is(error) || SessionInvalidError.is(error)) return new Unauthorized();
  return undefined;
}
