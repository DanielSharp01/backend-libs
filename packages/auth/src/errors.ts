const AUTH_ERROR_SYMBOL = Symbol.for("@danielsharp/auth/error");

export class AuthError<TCode extends string = string> extends Error {
  readonly [AUTH_ERROR_SYMBOL] = true;

  protected constructor(
    message: string,
    readonly code: TCode,
  ) {
    super(message);
    this.name = "AuthError";
  }

  static is(error: unknown): error is AuthError {
    return (
      typeof error === "object" &&
      error !== null &&
      AUTH_ERROR_SYMBOL in error &&
      error[AUTH_ERROR_SYMBOL] === true &&
      "code" in error &&
      typeof error.code === "string"
    );
  }
}

export class SessionInvalidError extends AuthError<typeof SessionInvalidError.code> {
  static readonly code = "SESSION_INVALID";

  constructor() {
    super("The session is invalid.", SessionInvalidError.code);
    this.name = "SessionInvalidError";
  }

  static is(error: unknown): error is SessionInvalidError {
    return AuthError.is(error) && error.code === SessionInvalidError.code;
  }
}

export class OAuthError extends AuthError<typeof OAuthError.code> {
  static readonly code = "OAUTH_ERROR";

  constructor(public readonly cause: unknown) {
    super(`OAuth authentication failed`, OAuthError.code);
    this.name = "OAuthError";
  }

  static is(error: unknown): error is OAuthError {
    return AuthError.is(error) && error.code === OAuthError.code;
  }
}

/** OAuth's `access_denied`: the person or the provider refused consent, as opposed to sign-in failing. */
export class OAuthDeniedError extends AuthError<typeof OAuthDeniedError.code> {
  static readonly code = "OAUTH_DENIED";

  constructor() {
    super("OAuth sign-in was denied", OAuthDeniedError.code);
    this.name = "OAuthDeniedError";
  }

  static is(error: unknown): error is OAuthDeniedError {
    return AuthError.is(error) && error.code === OAuthDeniedError.code;
  }
}
