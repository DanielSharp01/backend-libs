import { describe, expect, it } from "vitest";

import * as auth from "../src/index";
import * as google from "../src/google";

describe("public API", () => {
  it("exposes the supported root exports", () => {
    expect(Object.keys(auth).sort()).toEqual([
      "AuthError",
      "OAuthError",
      "SessionInvalidError",
      "hashToken",
      "issueExpiringToken",
      "issueOpaqueToken",
      "issuePkce",
      "sessionProvider",
      "tokenSecondsUntil",
    ]);
  });

  it("keeps Google OAuth on the google entry point", () => {
    expect(Object.keys(google)).toEqual(["googleOauth"]);
  });
});
