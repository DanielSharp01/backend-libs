import { describe, expect, it } from "vitest";

import { AuthError, OAuthDeniedError, OAuthError } from "../src/errors";

describe("OAuth errors", () => {
  it("tells a denied sign-in apart from a failed one", () => {
    const denied = new OAuthDeniedError();
    const failed = new OAuthError(new Error("exchange failed"));

    expect(AuthError.is(denied)).toBe(true);
    expect(OAuthDeniedError.is(denied)).toBe(true);
    expect(OAuthError.is(denied)).toBe(false);
    expect(OAuthDeniedError.is(failed)).toBe(false);
    expect(denied.code).toBe("OAUTH_DENIED");
  });
});
