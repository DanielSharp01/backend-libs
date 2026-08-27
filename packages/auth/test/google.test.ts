import { beforeEach, describe, expect, it, vi } from "vitest";

import { OAuthError } from "../src/errors";
import { googleOauth } from "../src/google";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  generateAuthUrl: vi.fn(),
  getToken: vi.fn(),
  getPayload: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  CodeChallengeMethod: { Plain: "plain", S256: "S256" },
  OAuth2Client: vi.fn(
    class {
      constructor(...args: unknown[]) {
        mocks.createClient(...args);
      }

      generateAuthUrl = mocks.generateAuthUrl;
      getToken = mocks.getToken;
      verifyIdToken = mocks.verifyIdToken;
    },
  ),
}));

describe("googleOauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateAuthUrl.mockReturnValue("https://accounts.google.com/authorize");
    mocks.getToken.mockResolvedValue({ tokens: { id_token: "id-token" } });
    mocks.verifyIdToken.mockResolvedValue({ getPayload: mocks.getPayload });
    mocks.getPayload.mockReturnValue({
      sub: "google-user",
      email: "user@example.com",
      email_verified: true,
      hd: "example.com",
      name: "Example User",
      given_name: "Example",
      family_name: "User",
      picture: "https://example.com/avatar.png",
      locale: "en",
    });
  });

  it("generates an authorization URL with the default identity scopes", () => {
    const provider = googleOauth({ clientId: "client-id", clientSecret: "client-secret" });

    expect(
      provider.getAuthorizationUrl({
        redirectUri: "https://example.com/callback",
        state: "state",
      }),
    ).toBe("https://accounts.google.com/authorize");
    expect(mocks.generateAuthUrl).toHaveBeenCalledWith({
      redirect_uri: "https://example.com/callback",
      scope: ["openid", "email", "profile"],
      state: "state",
    });
  });

  it("adds an S256 PKCE challenge and optional nonce to the authorization URL", () => {
    const provider = googleOauth({
      clientId: "client-id",
      clientSecret: "client-secret",
      scopes: ["openid", "email", "custom-scope"],
    });

    provider.getAuthorizationUrl({
      redirectUri: "https://example.com/callback",
      state: "state",
      codeChallenge: "code-challenge",
      nonce: "nonce",
    });

    expect(mocks.generateAuthUrl).toHaveBeenCalledWith({
      redirect_uri: "https://example.com/callback",
      scope: ["openid", "email", "custom-scope"],
      state: "state",
      code_challenge: "code-challenge",
      code_challenge_method: "S256",
      nonce: "nonce",
    });
  });

  it("exchanges the authorization code and returns the Google identity", async () => {
    const provider = googleOauth({ clientId: "client-id", clientSecret: "client-secret" });

    await expect(
      provider.getIdentity({
        code: "code",
        redirectUri: "https://example.com/callback",
      }),
    ).resolves.toEqual({
      sub: "google-user",
      email: "user@example.com",
      emailVerified: true,
      hostedDomain: "example.com",
      name: "Example User",
      givenName: "Example",
      familyName: "User",
      picture: "https://example.com/avatar.png",
      locale: "en",
    });
    expect(mocks.createClient).toHaveBeenCalledWith("client-id", "client-secret");
    expect(mocks.getToken).toHaveBeenCalledWith({
      code: "code",
      redirect_uri: "https://example.com/callback",
    });
    expect(mocks.verifyIdToken).toHaveBeenCalledWith({ idToken: "id-token", audience: "client-id" });
  });

  it("passes a PKCE code verifier to the token exchange", async () => {
    const provider = googleOauth({ clientId: "client-id", clientSecret: "client-secret" });

    await provider.getIdentity({
      code: "code",
      redirectUri: "https://example.com/callback",
      codeVerifier: "code-verifier",
    });

    expect(mocks.getToken).toHaveBeenCalledWith({
      code: "code",
      redirect_uri: "https://example.com/callback",
      codeVerifier: "code-verifier",
    });
  });

  it("accepts an ID token with the expected nonce", async () => {
    mocks.getPayload.mockReturnValue({ sub: "google-user", nonce: "nonce" });
    const provider = googleOauth({ clientId: "client-id", clientSecret: "client-secret" });

    await expect(
      provider.getIdentity({
        code: "code",
        redirectUri: "https://example.com/callback",
        nonce: "nonce",
      }),
    ).resolves.toMatchObject({ sub: "google-user" });
  });

  it("rejects an ID token without the expected nonce", async () => {
    mocks.getPayload.mockReturnValue({ sub: "google-user", nonce: "different-nonce" });
    const provider = googleOauth({ clientId: "client-id", clientSecret: "client-secret" });

    await expect(
      provider.getIdentity({
        code: "code",
        redirectUri: "https://example.com/callback",
        nonce: "nonce",
      }),
    ).rejects.toMatchObject({
      code: "OAUTH_ERROR",
      cause: expect.objectContaining({ message: "Google ID token nonce does not match the OAuth request." }),
    });
  });

  it("returns explicit undefined for absent optional claims", async () => {
    mocks.getPayload.mockReturnValue({ sub: "google-user" });
    const provider = googleOauth({ clientId: "client-id", clientSecret: "client-secret" });

    await expect(provider.getIdentity({ code: "code", redirectUri: "https://example.com/callback" })).resolves.toEqual({
      sub: "google-user",
      email: undefined,
      emailVerified: undefined,
      hostedDomain: undefined,
      name: undefined,
      givenName: undefined,
      familyName: undefined,
      picture: undefined,
      locale: undefined,
    });
  });

  it("wraps Google authentication failures", async () => {
    const cause = new Error("token exchange failed");
    mocks.getToken.mockRejectedValue(cause);
    const provider = googleOauth({ clientId: "client-id", clientSecret: "client-secret" });

    const result = provider.getIdentity({
      code: "code",
      redirectUri: "https://example.com/callback",
    });

    await expect(result).rejects.toBeInstanceOf(OAuthError);
    await expect(result).rejects.toMatchObject({ cause, code: "OAUTH_ERROR" });
  });

  it("rejects an ID token without a payload", async () => {
    mocks.getPayload.mockReturnValue(undefined);
    const provider = googleOauth({ clientId: "client-id", clientSecret: "client-secret" });

    await expect(
      provider.getIdentity({
        code: "code",
        redirectUri: "https://example.com/callback",
      }),
    ).rejects.toMatchObject({
      code: "OAUTH_ERROR",
      cause: expect.objectContaining({ message: "Failed to get payload from Google ID token." }),
    });
  });
});
