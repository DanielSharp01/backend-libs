import crypto from "node:crypto";

export interface OAuthAuthorizationRequest {
  redirectUri: string;
  state: string;
  codeChallenge?: string;
  nonce?: string;
}

export interface OAuthRequest {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  nonce?: string;
}

export interface Pkce {
  codeVerifier: string;
  codeChallenge: string;
}

export interface OAuthProvider<TIdentity> {
  getAuthorizationUrl(request: OAuthAuthorizationRequest): string;
  getIdentity(request: OAuthRequest): Promise<TIdentity>;
}

export function issuePkce(): Pkce {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}
