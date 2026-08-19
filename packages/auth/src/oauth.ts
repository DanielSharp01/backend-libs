export interface OAuthRequest {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}

export interface OAuthProvider<TIdentity> {
  getIdentity(request: OAuthRequest): Promise<TIdentity>;
}
