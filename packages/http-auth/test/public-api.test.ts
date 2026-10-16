import { describe, expect, it } from "vitest";

import * as httpAuth from "../src/index";

describe("public API", () => {
  it("exposes only the authentication middleware, schemes and OAuth callback", () => {
    expect(Object.keys(httpAuth).sort()).toEqual([
      "AuthenticationRequired",
      "MalformedBearerHeader",
      "authErrorMapper",
      "authentication",
      "bearerTokenScheme",
      "cookieScheme",
      "oauthCallback",
    ]);
  });
});
